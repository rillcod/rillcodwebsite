import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { syncRosterBillingForCycle, syncRosterBillingForInvoice } from '@/lib/rosters/billing-sync';
import { toJson } from '@/lib/supabase/json';

type FinanceDb = { from: (table: string) => any };

export async function finalizeFullRefund(
  db: FinanceDb,
  input: { transactionId: string; reason: string; gatewayRefund: Record<string, unknown>; actorId?: string | null },
): Promise<FinanceWriteResult<Record<string, unknown>>> {
  const reason = String(input.reason || '').trim();
  if (reason.length < 3) return financeFail('validation', 'A refund reason is required');
  const { data: tx, error: txError } = await db.from('payment_transactions')
    .select('*, invoices!payment_transactions_invoice_id_fkey(id, original_amount, amount, amount_paid, amount_remaining, status, due_date, billing_cycle_id)')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (txError) return financeFail('db_error', txError.message);
  if (!tx) return financeFail('not_found', 'Payment transaction not found');
  if (String(tx.payment_status).toLowerCase() === 'refunded') return financeOk(tx as Record<string, unknown>, ['refund_reused']);
  if (!['completed', 'success', 'paid'].includes(String(tx.payment_status || '').toLowerCase())) {
    return financeFail('invalid_transition', 'Only a completed payment can be refunded');
  }

  const existingGateway = tx.payment_gateway_response && typeof tx.payment_gateway_response === 'object' && !Array.isArray(tx.payment_gateway_response)
    ? tx.payment_gateway_response as Record<string, unknown>
    : {};
  const now = new Date().toISOString();
  const { data: refunded, error: refundError } = await db.from('payment_transactions').update({
    payment_status: 'refunded',
    refunded_at: now,
    refund_reason: reason,
    updated_at: now,
    payment_gateway_response: toJson({
      ...existingGateway,
      refund: { ...input.gatewayRefund, reason, actor_id: input.actorId ?? null, finalized_at: now },
    }),
  }).eq('id', tx.id).in('payment_status', ['completed', 'success', 'paid']).select().maybeSingle();
  if (refundError) return financeFail('db_error', 'Refund ledger update failed: ' + refundError.message);
  if (!refunded) return financeFail('conflict', 'Payment changed while refund was being finalized');

  const effects = ['payment_refunded'];
  const invoice = Array.isArray(tx.invoices) ? tx.invoices[0] : tx.invoices;
  if (invoice?.id) {
    const total = Math.max(0, Number(invoice.original_amount ?? invoice.amount ?? 0) || 0);
    const paid = Math.max(0, Number(invoice.amount_paid ?? 0) || 0);
    const nextPaid = Math.max(0, paid - (Number(tx.amount) || 0));
    const nextRemaining = Math.max(0, total - nextPaid);
    const nextStatus = nextPaid > 0
      ? 'partially_paid'
      : (invoice.due_date && new Date(invoice.due_date).getTime() < Date.now() ? 'overdue' : 'sent');
    const { error: invoiceError } = await db.from('invoices').update({
      amount_paid: nextPaid,
      amount_remaining: nextRemaining,
      status: nextStatus,
      updated_at: now,
    }).eq('id', invoice.id);
    if (invoiceError) {
      return financeFail('db_error', 'Payment refunded but invoice reversal failed: ' + invoiceError.message, undefined, { transaction_id: tx.id });
    }
    const rosterInvoice = await syncRosterBillingForInvoice(db as any, invoice.id, nextStatus);
    if (!rosterInvoice.ok) {
      return financeFail('db_error', 'Invoice reversed but roster sync failed: ' + rosterInvoice.error, undefined, { transaction_id: tx.id, invoice_id: invoice.id });
    }
    effects.push('invoice_reopened', 'invoice_roster_reopened');

    if (invoice.billing_cycle_id) {
      const cycleStatus = invoice.due_date && new Date(invoice.due_date).getTime() < Date.now() ? 'past_due' : 'due';
      const { error: cycleError } = await db.from('billing_cycles').update({
        status: cycleStatus,
        updated_at: now,
      }).eq('id', invoice.billing_cycle_id).eq('status', 'paid');
      if (cycleError) {
        return financeFail('db_error', 'Invoice reversed but billing cycle reopening failed: ' + cycleError.message, undefined, { transaction_id: tx.id });
      }
      const rosterCycle = await syncRosterBillingForCycle(db as any, invoice.billing_cycle_id, cycleStatus);
      if (!rosterCycle.ok) {
        return financeFail('db_error', 'Billing cycle reopened but roster sync failed: ' + rosterCycle.error, undefined, { transaction_id: tx.id });
      }
      effects.push('billing_cycle_reopened');
    }
  }

  if (tx.course_id && tx.portal_user_id) {
    const { data: course, error: courseError } = await db.from('courses').select('program_id').eq('id', tx.course_id).maybeSingle();
    if (courseError) {
      return financeFail('db_error', 'Refund completed but course lookup failed: ' + courseError.message, undefined, { transaction_id: tx.id });
    }
    if (course?.program_id) {
      const { error: enrollmentError } = await db.from('enrollments').update({ status: 'suspended' })
        .eq('user_id', tx.portal_user_id)
        .eq('program_id', course.program_id);
      if (enrollmentError) {
        return financeFail('db_error', 'Refund completed but enrolment suspension failed: ' + enrollmentError.message, undefined, { transaction_id: tx.id });
      }
      effects.push('enrollment_suspended');
    }
  }

  return financeOk(refunded as Record<string, unknown>, effects);
}
