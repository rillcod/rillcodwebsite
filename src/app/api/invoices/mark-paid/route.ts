/**
 * POST /api/invoices/mark-paid   (finance administrator only)
 * Body: { invoiceId: string; amount?: number }
 *
 * #12 — Invoice lifecycle guard. Marking an invoice paid must be consistent:
 *   • Validate any supplied payment amount against the invoice amount.
 *   • ALWAYS ensure a payment_transactions record exists (create a manual one if
 *     the invoice has none) so finance/receipts reconcile.
 *   • Generate the receipt + write an audit log.
 * Replaces the raw `update({ status: 'paid' })` the dashboard used.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { verifyInvoicePayment } from '@/lib/payments/verified-payment';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import {
  buildSmartFinanceWhatsAppText,
  buildWhatsAppShareHref,
  isDeliverableExternalEmail,
} from '@/lib/finance/smart-communication';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role, school_id').eq('id', user.id).single();
    if (!caller || !roleHasCapability(caller.role, 'manage_finance')) {
      return NextResponse.json({ error: 'Finance administrator access required' }, { status: 403 });
    }

    const { invoiceId, amount, method, reference, note, notifyPayer = true } = await req.json().catch(() => ({}));
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, invoice_number, amount, original_amount, amount_paid, amount_remaining, currency, status, stream, payment_transaction_id, portal_user_id, school_id, metadata, schools(name), portal_users!invoices_portal_user_id_fkey(school_id, full_name, email)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    if (invoice.status === 'paid' && amount == null) {
      return NextResponse.json({ success: true, message: 'Invoice already paid', alreadyPaid: true });
    }
    if (invoice.status === 'cancelled' || invoice.status === 'void') {
      return NextResponse.json({ error: `Cannot mark a ${invoice.status} invoice as paid.` }, { status: 409 });
    }

    const remainingAmount = Number(
      invoice.amount_remaining != null
        ? invoice.amount_remaining
        : Math.max(0, Number(invoice.original_amount ?? invoice.amount ?? 0) - Number(invoice.amount_paid ?? 0)),
    );
    const defaultAmount = remainingAmount > 0 ? remainingAmount : Number(invoice.amount) || 0;
    const paidAmount = amount != null ? Number(amount) : defaultAmount;

    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return NextResponse.json(
        { error: 'Enter a valid payment amount greater than zero.' },
        { status: 400 },
      );
    }

    const result = await verifyInvoicePayment({
      invoiceId: invoice.id,
      amount: paidAmount,
      currency: invoice.currency || 'NGN',
      method: method || 'manual',
      reference: reference || undefined,
      note: note || undefined,
      actorId: user.id,
      source: 'manual_invoice_paid',
    });

    const overpaidAmount = result.overpaidAmount ?? 0;
    const nextRemaining = result.remainingAmount ?? 0;
    const resolvedStatus = result.status ?? (nextRemaining > 0.01 ? 'partially_paid' : 'paid');
    const cumulativePaid = Math.max(0, Number(invoice.amount_paid ?? 0) + paidAmount);

    // Resolve recipient contact for WhatsApp share link & school/partial payment email acknowledgement
    let recipientEmail: string | null = null;
    let recipientPhone: string | null = null;
    const isSchoolStream = invoice.stream === 'school' || (Boolean(invoice.school_id) && !invoice.portal_user_id);
    let recipientName: string = isSchoolStream
      ? ((invoice.schools as any)?.name || 'Partner School')
      : ((invoice.portal_users as any)?.full_name || 'Valued Client');

    try {
      if (isSchoolStream && invoice.school_id) {
        const { data: bc } = await admin
          .from('billing_contacts')
          .select('representative_name, representative_email, representative_whatsapp')
          .eq('school_id', invoice.school_id)
          .maybeSingle();
        if (bc?.representative_name) recipientName = bc.representative_name;
        if (isDeliverableExternalEmail(bc?.representative_email)) {
          recipientEmail = bc!.representative_email!.trim();
        }
        recipientPhone = bc?.representative_whatsapp || null;
        if (!recipientEmail || !recipientPhone) {
          const { data: su } = await admin
            .from('portal_users')
            .select('email, phone')
            .eq('school_id', invoice.school_id)
            .eq('role', 'school')
            .maybeSingle();
          if (!recipientEmail && isDeliverableExternalEmail(su?.email)) recipientEmail = su!.email!.trim();
          if (!recipientPhone && su?.phone) recipientPhone = su.phone;
        }
      } else if (invoice.portal_user_id) {
        const { data: stu } = await admin
          .from('students')
          .select('parent_name, parent_email, parent_phone, phone')
          .eq('user_id', invoice.portal_user_id)
          .maybeSingle();
        if (stu?.parent_name) recipientName = stu.parent_name;
        if (isDeliverableExternalEmail(stu?.parent_email)) {
          recipientEmail = stu!.parent_email!.trim();
        } else if (isDeliverableExternalEmail((invoice.portal_users as any)?.email)) {
          recipientEmail = (invoice.portal_users as any).email.trim();
        }
        recipientPhone = stu?.parent_phone || stu?.phone || null;
      }

      // Send payment/installment acknowledgement email for school stream or partial/credit settlements
      if (notifyPayer !== false && recipientEmail && (isSchoolStream || resolvedStatus === 'partially_paid' || overpaidAmount > 0)) {
        const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');
        const { notificationsService } = await import('@/services/notifications.service');
        const fmtDate = (d?: string | null) =>
          (d ? new Date(d) : new Date()).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
        const summaryNote =
          overpaidAmount > 0
            ? `Invoice #${invoice.invoice_number} is PAID IN FULL with +₦${overpaidAmount.toLocaleString('en-NG')} overpayment credit stored on your ledger.${note ? ` Note: ${note}` : ''}`
            : nextRemaining > 0.01
              ? `Partial payment recorded on Invoice #${invoice.invoice_number}. Remaining balance due: ₦${nextRemaining.toLocaleString('en-NG')}.${note ? ` Note: ${note}` : ''}`
              : `Invoice #${invoice.invoice_number} has been settled in full.${note ? ` Note: ${note}` : ''}`;

        const html = buildReceiptHTML({
          docRef: reference || invoice.invoice_number || invoice.id.slice(0, 8).toUpperCase(),
          dateStr: fmtDate(),
          payDateStr: fmtDate(),
          payerLabel: recipientName,
          payerType: isSchoolStream ? 'school' : 'student',
          paymentMethod: method || 'bank_transfer',
          receivedBy: 'Rillcod Technologies',
          items: [
            {
              description:
                resolvedStatus === 'partially_paid'
                  ? `Installment Payment — Invoice #${invoice.invoice_number}`
                  : `Payment Settlement — Invoice #${invoice.invoice_number}`,
              quantity: 1,
              unit_price: paidAmount,
            },
          ],
          totalAmount: paidAmount,
          payToAcc: null,
          notes: summaryNote,
          mode: 'email',
          actionUrl: result.receiptUrl || undefined,
        });

        await notificationsService.sendExternalEmail({
          to: recipientEmail,
          subject:
            resolvedStatus === 'partially_paid'
              ? `Payment Received (₦${paidAmount.toLocaleString('en-NG')}) — Invoice #${invoice.invoice_number} | Rillcod Technologies`
              : `Payment Receipt — Invoice #${invoice.invoice_number} | Rillcod Technologies`,
          html,
          fromName: 'Rillcod Technologies',
          fromEmail: SMTP_FROM_EMAIL,
        });
      }
    } catch (ackErr) {
      console.warn('[invoices/mark-paid] non-fatal acknowledgement warning:', ackErr);
    }

    const termLabel =
      typeof (invoice.metadata as any)?.term_label === 'string'
        ? (invoice.metadata as any).term_label
        : null;

    const waReceiptText = buildSmartFinanceWhatsAppText({
      mode: 'receipt',
      recipientName,
      invoiceNumber: invoice.invoice_number || invoice.id.slice(0, 8).toUpperCase(),
      currency: invoice.currency || 'NGN',
      totalAmount: Number(invoice.original_amount ?? invoice.amount ?? 0),
      amountPaid: cumulativePaid,
      remainingAmount: nextRemaining,
      overpaidAmount,
      termLabel,
      receiptUrl: result.receiptUrl || null,
      customNote: note || null,
    });
    const whatsappReceiptUrl = buildWhatsAppShareHref(recipientPhone, waReceiptText);

    await logAudit(admin as any, {
      action: resolvedStatus === 'partially_paid' ? 'invoice_partially_paid' : 'invoice_marked_paid',
      actorId: user.id,
      resourceType: 'invoice',
      resourceId: invoice.id,
      newValue: `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)} · ${(invoice.currency || 'NGN')} ${paidAmount.toLocaleString()} ${resolvedStatus === 'partially_paid' ? 'partial payment recorded' : overpaidAmount > 0 ? `marked paid (+${overpaidAmount.toLocaleString()} credit)` : 'marked paid'}`,
      newValues: {
        summary: `Recorded ${(invoice.currency || 'NGN')} ${paidAmount.toLocaleString()} on invoice ${invoice.invoice_number || '—'}`,
        invoice_number: invoice.invoice_number,
        amount: paidAmount,
        invoice_total: Number(invoice.amount) || 0,
        overpaid_amount: overpaidAmount,
        remaining_amount: nextRemaining,
        status: resolvedStatus,
        method: method || 'manual',
        currency: invoice.currency,
        transaction_id: result.transactionId,
      },
    });

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      receiptUrl: result.receiptUrl,
      status: resolvedStatus,
      paidAmount,
      overpaidAmount,
      remainingAmount: nextRemaining,
      acknowledgedTo: notifyPayer !== false ? recipientEmail : null,
      whatsappReceiptUrl,
    });
  } catch (err: any) {
    console.error('[invoices/mark-paid]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
