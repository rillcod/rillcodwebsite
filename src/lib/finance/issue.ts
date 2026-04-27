/**
 * Central receipt issuer. Called by:
 *   • POST /api/payments/webhook           (gateway confirmation)
 *   • POST /api/payments/approve           (manual bank-transfer approval)
 *   • POST /api/payments/receipt/[id]      (lazy generation when a user
 *                                           opens the Money hub)
 *
 * Responsibilities:
 *   1. Load the payment transaction and every related entity.
 *   2. Classify the stream (SCHOOL vs INDIVIDUAL).
 *   3. Hand the data to the correct pdfmake document definition.
 *   4. Upload the PDF to Supabase storage.
 *   5. Upsert the `receipts` row (so the DB trigger issues a
 *      stream-specific receipt_number).
 *   6. Update payment_transactions.receipt_url.
 *
 * This file is the ONLY place that should talk to pdfmake for
 * receipts. If you need a different layout, add a new template
 * and branch here — do not inline PDFs elsewhere.
 */
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyReceiptStream, classifyInvoiceStream, splitSchoolAmount, DEFAULT_COMMISSION_RATE } from './streams';
import { buildIndividualReceiptDocDef } from './templates/receipt-individual';
import { buildSchoolReceiptDocDef } from './templates/receipt-school';
import type { ReceiptTemplateInput } from './templates/types';

// Dynamic require so pdfmake is only loaded server-side and on demand.
let PdfPrinter: any = null;
try {
  PdfPrinter = require('pdfmake');
} catch {
  /* pdfmake is optional at build-time */
}

const FONTS = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

async function pdfToBuffer(docDefinition: any): Promise<Buffer> {
  if (!PdfPrinter) throw new AppError('pdfmake not installed or failed to load', 500);
  const printer = new PdfPrinter(FONTS);
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    pdfDoc.on('data', (c: Buffer) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', (e: any) => reject(e));
    pdfDoc.end();
  });
}

/**
 * Issue (or re-issue) the PDF receipt for a completed transaction.
 * Returns the public URL to the PDF.
 */
export async function issueReceiptForTransaction(transactionId: string): Promise<{
  url: string;
  stream: 'school' | 'individual';
  receiptNumber: string | null;
}> {
  const supabase: any = createAdminClient();

  const { data: txn, error } = await supabase
    .from('payment_transactions')
    .select(`
      *,
      courses(title, program_id),
      invoices!payment_transactions_invoice_id_fkey(
        id, invoice_number, stream, items, due_date, school_id, portal_user_id, billing_cycle_id, metadata
      ),
      portal_users:portal_user_id(full_name, email),
      schools:school_id(id, name, address, commission_rate)
    `)
    .eq('id', transactionId)
    .single();

  if (error || !txn) throw new AppError('Transaction not found', 404);
  if (txn.payment_status !== 'completed') {
    throw new AppError('Receipt can only be issued for completed payments', 400);
  }

  const invoice = txn.invoices as any | null;
  const school = txn.schools as any | null;
  const payer = txn.portal_users as any | null;

  // Classification — invoice stream wins when present, else transaction.
  const stream = invoice
    ? classifyInvoiceStream(invoice)
    : classifyReceiptStream({ school_id: txn.school_id, student_id: txn.portal_user_id, metadata: txn.payment_gateway_response });

  const amount = Number(txn.amount);
  const currency = txn.currency || 'NGN';

  // ── Build template input ──
  let items: ReceiptTemplateInput['items'];
  if (Array.isArray(invoice?.items) && invoice.items.length > 0) {
    items = invoice.items.map((it: any) => ({
      description: String(it.description ?? 'Service'),
      quantity: Number(it.quantity ?? 1),
      unit_price: Number(it.unit_price ?? 0),
      total: Number(it.total ?? it.amount ?? (Number(it.unit_price ?? 0) * Number(it.quantity ?? 1))),
    }));
  } else {
    items = [
      {
        description: invoice?.invoice_number
          ? `Payment for invoice ${invoice.invoice_number}`
          : (txn.courses?.title || (stream === 'school' ? 'Billing cycle settlement' : 'Academic enrolment fee')),
        quantity: 1,
        unit_price: amount,
        total: amount,
      },
    ];
  }

  // Commission / settlement metadata for schools
  let extraMeta: ReceiptTemplateInput['meta'] = {
    invoiceNumber: invoice?.invoice_number,
    courseTitle: txn.courses?.title,
  };

  if (stream === 'school' && invoice?.billing_cycle_id) {
    const { data: cycle } = await supabase
      .from('billing_cycles')
      .select('id, rillcod_retain_amount, school_settlement_amount, items, term_label, metadata')
      .eq('id', invoice.billing_cycle_id)
      .single();

    const commissionRate = Number(school?.commission_rate ?? DEFAULT_COMMISSION_RATE);
    const split = splitSchoolAmount(amount, commissionRate);

    extraMeta = {
      ...extraMeta,
      commissionRate,
      rillcodRetain: cycle?.rillcod_retain_amount != null ? Number(cycle.rillcod_retain_amount) : split.rillcodRetain,
      schoolSettlement: cycle?.school_settlement_amount != null ? Number(cycle.school_settlement_amount) : split.schoolSettlement,
      studentCount: Array.isArray(cycle?.items) ? cycle.items.length : undefined,
    };

    if ((cycle as any)?.term_label && !extraMeta.invoiceNumber) {
      extraMeta.invoiceNumber = (cycle as any).term_label;
    }
  }

  const templateInput: ReceiptTemplateInput = {
    receiptNumber: 'PENDING', // real number is assigned by DB trigger on insert
    transactionReference: txn.transaction_reference || txn.external_transaction_id || txn.id.slice(0, 8),
    paidAt: txn.paid_at || txn.created_at || new Date().toISOString(),
    paymentMethod: txn.payment_method || 'online',
    amount,
    currency,
    items,
    payer: {
      name: payer?.full_name || (stream === 'school' ? (school?.name || 'Partner School') : 'Valued Learner'),
      email: payer?.email,
      schoolName: school?.name,
      address: school?.address,
      term: stream === 'school' ? (invoice?.metadata?.term_label || undefined) : undefined,
    },
    meta: extraMeta,
    notes: invoice?.metadata?.receipt_note,
  };

  // Insert receipts row FIRST so we get a stream-specific number
  // (generate_receipt_number() trigger reads NEW.stream).
  const { data: existing } = await supabase
    .from('receipts')
    .select('id, receipt_number, pdf_url')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  let receiptId = existing?.id as string | undefined;
  let receiptNumber = existing?.receipt_number as string | null | undefined;

  if (!existing) {
    const { data: inserted, error: insErr } = await supabase
      .from('receipts')
      .insert({
        transaction_id: txn.id,
        student_id: stream === 'individual' ? txn.portal_user_id : null,
        school_id: txn.school_id,
        amount,
        currency,
        stream,
        metadata: {
          stream,
          generated_at: new Date().toISOString(),
          commission_rate: extraMeta.commissionRate,
          rillcod_retain: extraMeta.rillcodRetain,
          school_settlement: extraMeta.schoolSettlement,
          invoice_number: invoice?.invoice_number,
        },
      })
      .select('id, receipt_number')
      .single();
    if (insErr) throw new AppError(`Failed to record receipt: ${insErr.message}`, 500);
    receiptId = inserted?.id;
    receiptNumber = inserted?.receipt_number;
  }

  if (receiptNumber) templateInput.receiptNumber = receiptNumber;

  // ── Render PDF ──
  const docDef = stream === 'school'
    ? buildSchoolReceiptDocDef(templateInput)
    : buildIndividualReceiptDocDef(templateInput);

  const buffer = await pdfToBuffer(docDef);

  // ── Upload to storage ──
  const { storageService } = await import('@/services/storage.service');
  const storagePath = `${txn.id}.pdf`;
  const urlPath = await storageService.uploadFile('receipts', storagePath, buffer, 'application/pdf');
  
  // For R2, we use the media proxy; for Supabase, we use the path.
  // StorageService returns the path. If R2 is active, we should generate a public URL or use the proxy.
  // Actually, StorageService.getDownloadUrl handles the signed URL/public URL logic.
  const url = await storageService.getDownloadUrl('receipts', urlPath);

  // ── Persist URLs ──
  await supabase.from('payment_transactions').update({ receipt_url: url }).eq('id', txn.id);
  if (receiptId) {
    await supabase.from('receipts').update({ pdf_url: url }).eq('id', receiptId);
  }

  return { url, stream, receiptNumber: receiptNumber ?? null };
}
