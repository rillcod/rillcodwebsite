import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSummerBalanceDue, getSummerTotalTuition } from '@/lib/summer-school/pricing';
import { processSuccessfulPayment } from './process-successful-payment';
import { createPendingPayment } from './pending-transaction';

const MANUAL_METHODS = ['cash', 'pos', 'bank_transfer', 'cheque', 'mobile_money', 'manual', 'other'] as const;

function cleanReference(reference: string | undefined, prefix: string) {
  const trimmed = reference?.trim();
  if (trimmed) return trimmed;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizeMethod(method: string | undefined) {
  const value = String(method || 'manual').toLowerCase();
  return MANUAL_METHODS.includes(value as any) ? value : 'manual';
}

async function sumCompletedProspectPayments(db: any, prospectId: string) {
  const { data: txs, error } = await db
    .from('payment_transactions')
    .select('amount')
    .contains('payment_gateway_response', { prospect_id: prospectId })
    .in('payment_status', ['completed', 'success', 'paid']);
  if (error) throw new AppError(Could not calculate completed payments: , 500);
  return (txs ?? []).reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
}

async function prospectHasSibling(db: any, email: string | null) {
  if (!email) return false;
  const [{ count: studentCount }, { count: prospectiveCount }] = await Promise.all([
    db.from('students').select('id', { count: 'exact', head: true }).eq('parent_email', email),
    db.from('prospective_students').select('id', { count: 'exact', head: true }).eq('parent_email', email),
  ]);
  return (studentCount || 0) + (prospectiveCount || 0) > 1;
}

export async function verifyInvoicePayment(input: {
  invoiceId: string;
  amount?: number;
  currency?: string;
  method?: string;
  reference?: string;
  note?: string;
  actorId: string;
  source?: string;
  proofId?: string;
}) {
  const db: any = createAdminClient();
  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .select('id, invoice_number, amount, original_amount, amount_paid, amount_remaining, currency, status, payment_transaction_id, portal_user_id, school_id')
    .eq('id', input.invoiceId)
    .maybeSingle();

  if (invoiceError) throw new AppError(Invoice lookup failed: , 500);
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (['cancelled', 'void'].includes(String(invoice.status || '').toLowerCase())) {
    throw new AppError(`Cannot verify payment for a ${invoice.status} invoice.`, 409);
  }

  const remaining = Number(
    invoice.amount_remaining != null
      ? invoice.amount_remaining
      : Math.max(0, Number(invoice.original_amount ?? invoice.amount ?? 0) - Number(invoice.amount_paid ?? 0)),
  );
  const invoiceAmount = remaining > 0 ? remaining : Number(invoice.amount) || 0;
  const amount = input.amount == null ? invoiceAmount : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Enter a valid payment amount.', 400);
  if (amount > invoiceAmount + 1) {
    throw new AppError(`Payment amount (${amount}) exceeds invoice remaining (${invoiceAmount}).`, 400);
  }

  let transactionId = invoice.payment_transaction_id as string | null;
  let reference = cleanReference(input.reference, `MAN-INV-${String(invoice.invoice_number || invoice.id).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 28)}`);
  const method = normalizeMethod(input.method);
  const now = new Date().toISOString();

  // The invoice may not carry payment_transaction_id yet (checkout links the
  // transaction → invoice, not the reverse). Reuse any transaction already
  // attached to this invoice — preferring completed, then most recent — so a
  // staff verification during a pending gateway checkout doesn't insert a
  // duplicate ledger entry.
  if (!transactionId) {
    const { data: linkedTxs, error: linkedTxError } = await db
      .from('payment_transactions')
      .select('id, payment_status, created_at')
      .eq('invoice_id', invoice.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (linkedTxError) throw new AppError(Could not inspect linked payments: , 500);
    const completed = (linkedTxs ?? []).find((t: any) => ['completed', 'success', 'paid'].includes(String(t.payment_status || '').toLowerCase()));
    const reusable = completed ?? (linkedTxs ?? [])[0] ?? null;
    if (reusable) transactionId = reusable.id;
  }

  if (transactionId) {
    const { data: existingTx, error: existingTxError } = await db
      .from('payment_transactions')
      .select('id, transaction_reference, payment_status, receipt_url')
      .eq('id', transactionId)
      .maybeSingle();
    if (existingTxError) throw new AppError(Could not load payment record: , 500);
    if (existingTx?.transaction_reference) reference = existingTx.transaction_reference;
    if (['completed', 'success', 'paid'].includes(String(existingTx?.payment_status || '').toLowerCase())) {
      const { error: paidRepairError } = await db.from('invoices')
        .update({ status: 'paid', payment_transaction_id: transactionId, amount_remaining: 0, updated_at: now })
        .eq('id', invoice.id);
      if (paidRepairError) throw new AppError(`Could not repair paid invoice: ${paidRepairError.message}`, 500);
      return { invoiceId: invoice.id, transactionId, receiptUrl: existingTx.receipt_url ?? null, alreadyPaid: true };
    }
    const { error: reuseUpdateError } = await db.from('payment_transactions').update({
      amount,
      currency: input.currency || invoice.currency || 'NGN',
      payment_method: method,
      transaction_reference: reference,
      invoice_id: invoice.id,
      portal_user_id: invoice.portal_user_id,
      school_id: invoice.school_id,
      updated_at: now,
      payment_gateway_response: {
        payment_type: 'invoice_payment',
        invoice_id: invoice.id,
        source: input.source || 'staff_verification',
        verified_by: input.actorId,
        verified_at: now,
        proof_id: input.proofId || null,
        note: input.note || null,
      },
    }).eq('id', transactionId);
    if (reuseUpdateError) throw new AppError(Could not update reusable payment record: , 500);
  } else {
    const pending = await createPendingPayment(db, {
      portalUserId: invoice.portal_user_id,
      schoolId: invoice.school_id,
      invoiceId: invoice.id,
      amount,
      currency: input.currency || invoice.currency || 'NGN',
      method: method as any,
      reference,
      metadata: {
        payment_type: 'invoice_payment',
        invoice_id: invoice.id,
        source: input.source || 'staff_verification',
        verified_by: input.actorId,
        verified_at: now,
        proof_id: input.proofId || null,
        note: input.note || null,
      },
    });
    if (!pending.ok) throw new AppError(`Failed to create payment record: ${pending.error.message}`, pending.error.code === 'conflict' ? 409 : 500);
    transactionId = String((pending.data as any).id);
  }

  await processSuccessfulPayment(reference, method, {
    verified_by: input.actorId,
    verified_at: now,
    source: input.source || 'staff_verification',
    proof_id: input.proofId || null,
    note: input.note || null,
  });

  // Post-condition: don't report success to staff if the pipeline silently
  // failed to settle the invoice — that would hide a broken ledger.
  const { data: settledInvoice } = await db
    .from('invoices')
    .select('status')
    .eq('id', invoice.id)
    .maybeSingle();
  if (settledInvoice?.status !== 'paid') {
    throw new AppError(
      'Payment was recorded but the invoice could not be marked paid. Check the finance logs before retrying.',
      500,
    );
  }

  const { data: settledTx } = await db
    .from('payment_transactions')
    .select('id, receipt_url')
    .eq('transaction_reference', reference)
    .maybeSingle();
  return { invoiceId: invoice.id, transactionId: settledTx?.id || transactionId, receiptUrl: settledTx?.receipt_url ?? null, alreadyPaid: false };
}

export async function verifySummerBalancePayment(input: {
  prospectId: string;
  amount: number;
  method?: string;
  reference?: string;
  evidenceUrl?: string | null;
  note?: string;
  actorId: string;
  source?: string;
}) {
  const db: any = createAdminClient();
  const { data: prospect, error: prospectError } = await db
    .from('prospective_students')
    .select('id, full_name, parent_name, parent_email, email, preferred_schedule, status')
    .eq('id', input.prospectId)
    .maybeSingle();

  if (prospectError) throw new AppError(Applicant lookup failed: , 500);
  if (!prospect) throw new AppError('Applicant not found', 404);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Enter a valid payment amount.', 400);

  const parentEmail = String(prospect.parent_email || prospect.email || '').trim().toLowerCase();
  const preferredMode = prospect.preferred_schedule || 'Online';
  const amountPaid = await sumCompletedProspectPayments(db, prospect.id);
  const hasSibling = await prospectHasSibling(db, parentEmail || null);
  const totalTuition = getSummerTotalTuition(preferredMode, hasSibling);
  const balanceDue = getSummerBalanceDue(preferredMode, amountPaid, hasSibling);
  if (balanceDue <= 0) throw new AppError('This applicant has no outstanding balance.', 400);
  if (amount + 1 < balanceDue) {
    throw new AppError(`Payment amount (${amount}) is below the outstanding balance (${balanceDue}).`, 400);
  }
  if (amount - 1 > balanceDue) {
    throw new AppError(`Payment amount (${amount}) exceeds the outstanding balance (${balanceDue}) — check for a typo.`, 400);
  }

  const method = normalizeMethod(input.method);
  const reference = cleanReference(input.reference, `SUM-BAL-MAN-${prospect.id.slice(0, 6)}`);
  const now = new Date().toISOString();

  const pending = await createPendingPayment(db, {
    amount,
    currency: 'NGN',
    method: method as any,
    reference,
    subject: { type: 'prospect', id: prospect.id },
    metadata: {
      payment_type: 'summer_school_balance',
      prospect_id: prospect.id,
      student_name: prospect.full_name,
      parent_name: prospect.parent_name,
      parent_email: parentEmail || null,
      preferred_mode: preferredMode,
      total_tuition: totalTuition,
      previous_amount_paid: amountPaid,
      balance_due: balanceDue,
      balance_payment: true,
      manual: true,
      evidence_url: input.evidenceUrl || null,
      source: input.source || 'staff_balance_verification',
      verified_by: input.actorId,
      verified_at: now,
      note: input.note || null,
    },
  });
  if (!pending.ok) throw new AppError(`Failed to create payment record: ${pending.error.message}`, pending.error.code === 'conflict' ? 409 : 500);
  const tx = pending.data as { id: string };
  await processSuccessfulPayment(reference, method, {
    verified_by: input.actorId,
    verified_at: now,
    source: input.source || 'staff_balance_verification',
    evidence_url: input.evidenceUrl || null,
    note: input.note || null,
  });

  const { data: settledTx } = await db
    .from('payment_transactions')
    .select('id, invoice_id, receipt_url')
    .eq('transaction_reference', reference)
    .maybeSingle();
  return {
    prospectId: prospect.id,
    transactionId: settledTx?.id || tx.id,
    invoiceId: settledTx?.invoice_id ?? null,
    receiptUrl: settledTx?.receipt_url ?? null,
  };
}
