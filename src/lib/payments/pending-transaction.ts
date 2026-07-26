import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';

export type PendingPaymentInput = {
  reference: string;
  amount: number;
  currency?: string;
  method: 'paystack' | 'stripe' | 'bank_transfer' | 'cash' | 'pos' | 'cheque' | 'mobile_money' | 'manual' | 'other';
  schoolId?: string | null;
  portalUserId?: string | null;
  invoiceId?: string | null;
  courseId?: string | null;
  externalTransactionId?: string | null;
  subject?: { type: 'registration' | 'prospect'; id: string };
  /** Staff/parent who started the attempt when known (else inferred from metadata / portalUserId). */
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

type PaymentDb = { from: (table: string) => any };

export async function createPendingPayment(
  db: PaymentDb,
  input: PendingPaymentInput,
): Promise<FinanceWriteResult<Record<string, unknown>>> {
  const reference = String(input.reference || '').trim();
  if (!reference || reference.length > 160) return financeFail('validation', 'A valid transaction reference is required');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return financeFail('validation', 'Payment amount must be greater than zero');
  const currency = String(input.currency || 'NGN').trim().toUpperCase();
  if (!['NGN', 'USD'].includes(currency)) return financeFail('validation', 'Payment currency must be NGN or USD');
  if (!input.schoolId && !input.portalUserId && !input.invoiceId && !input.courseId && !input.subject?.id) return financeFail('validation', 'Payment must identify a school, payer, invoice, course, or registration subject');
  if (input.subject && !String(input.subject.id || '').trim()) return financeFail('validation', 'Payment subject id is required');
  if (input.portalUserId && !input.invoiceId) {
    const { data: payer, error: payerError } = await db.from('portal_users').select('id, school_id').eq('id', input.portalUserId).maybeSingle();
    if (payerError) return financeFail('db_error', 'Payer lookup failed: ' + payerError.message);
    if (!payer) return financeFail('not_found', 'Payer not found');
    if (input.schoolId && payer.school_id && input.schoolId !== payer.school_id) return financeFail('validation', 'Payment payer does not belong to the selected school');
  }
  if (input.invoiceId) {
    const { data: invoice, error: invoiceError } = await db.from('invoices')
      .select('id, school_id, portal_user_id, currency, status')
      .eq('id', input.invoiceId)
      .maybeSingle();
    if (invoiceError) return financeFail('db_error', 'Invoice lookup failed: ' + invoiceError.message);
    if (!invoice) return financeFail('not_found', 'Invoice not found');
    if (['paid', 'void', 'cancelled'].includes(String(invoice.status || '').toLowerCase())) return financeFail('conflict', `Invoice is ${invoice.status}`);
    if (invoice.school_id && input.schoolId && invoice.school_id !== input.schoolId) return financeFail('validation', 'Payment school does not match invoice school');
    if (invoice.currency && String(invoice.currency).toUpperCase() !== currency) return financeFail('validation', 'Payment currency does not match invoice currency');
  }

  const now = new Date().toISOString();
  const { data, error } = await db.from('payment_transactions').insert({
    school_id: input.schoolId ?? null,
    portal_user_id: input.portalUserId ?? null,
    invoice_id: input.invoiceId ?? null,
    course_id: input.courseId ?? null,
    amount,
    currency,
    payment_method: input.method,
    payment_status: 'pending',
    transaction_reference: reference,
    external_transaction_id: input.externalTransactionId ?? null,
    payment_gateway_response: input.metadata ?? {},
    created_at: now,
    updated_at: now,
  }).select().single();
  if (error) {
    if (error.code === '23505') return financeFail('conflict', 'A transaction with this reference already exists');
    return financeFail('db_error', error.message);
  }
  if (!data) return financeFail('db_error', 'Pending transaction insert returned no row');

  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  const actorId =
    input.actorId ||
    (typeof meta.recorded_by === 'string' ? meta.recorded_by : null) ||
    (typeof meta.actor_id === 'string' ? meta.actor_id : null) ||
    (typeof meta.parent_id === 'string' ? meta.parent_id : null) ||
    input.portalUserId ||
    null;
  const paymentType = typeof meta.payment_type === 'string' ? meta.payment_type : null;
  try {
    await logAudit(createAdminClient() as any, {
      action: 'payment_attempt_started',
      actorId,
      resourceType: 'payment_transaction',
      resourceId: String((data as any).id),
      tableName: 'payment_transactions',
      newValue: [
        currency,
        amount.toLocaleString(),
        input.method,
        paymentType,
        `ref ${reference}`,
      ].filter(Boolean).join(' · '),
      newValues: {
        amount,
        currency,
        method: input.method,
        reference,
        payment_type: paymentType,
        invoice_id: input.invoiceId ?? null,
        school_id: input.schoolId ?? null,
        subject_type: input.subject?.type ?? null,
        subject_id: input.subject?.id ?? null,
        source: typeof meta.source === 'string' ? meta.source : null,
      },
    });
  } catch {
    /* audit is non-fatal */
  }

  return financeOk(data as Record<string, unknown>, ['pending_transaction_created']);
}

export async function removePendingPayment(db: PaymentDb, transactionId: string): Promise<FinanceWriteResult<{ id: string }>> {
  const { data, error } = await db.from('payment_transactions')
    .delete()
    .eq('id', transactionId)
    .eq('payment_status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) return financeFail('db_error', error.message);
  if (!data) return financeFail('conflict', 'Pending transaction could not be removed');
  return financeOk({ id: transactionId }, ['pending_transaction_removed']);
}
