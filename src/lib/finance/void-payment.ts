import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';

type FinanceDb = { from: (table: string) => any };

export async function voidPaymentAttempt(
  db: FinanceDb,
  input: { transactionId: string; actorId: string; reason: string; schoolId?: string | null },
): Promise<FinanceWriteResult<Record<string, unknown>>> {
  const reason = String(input.reason || '').trim();
  if (reason.length < 3) return financeFail('validation', 'A void reason is required');

  let query = db.from('payment_transactions')
    .select('id, school_id, payment_status, payment_gateway_response')
    .eq('id', input.transactionId);
  if (input.schoolId) query = query.eq('school_id', input.schoolId);
  const { data: transaction, error: lookupError } = await query.maybeSingle();
  if (lookupError) return financeFail('db_error', lookupError.message);
  if (!transaction) return financeFail('not_found', 'Payment transaction not found');

  const current = String(transaction.payment_status || '').toLowerCase();
  if (['completed', 'success', 'paid', 'refunded'].includes(current)) {
    return financeFail('invalid_transition', 'Completed financial records cannot be voided. Use the refund/reversal workflow.');
  }
  const metadata = transaction.payment_gateway_response && typeof transaction.payment_gateway_response === 'object' && !Array.isArray(transaction.payment_gateway_response)
    ? transaction.payment_gateway_response as Record<string, unknown> : {};
  const now = new Date().toISOString();
  const { data: updated, error } = await db.from('payment_transactions').update({
    payment_status: 'failed',
    updated_at: now,
    payment_gateway_response: {
      ...metadata,
      reconciliation_voided: true,
      reconciliation_voided_by: input.actorId,
      reconciliation_voided_at: now,
      reconciliation_void_reason: reason,
    },
  }).eq('id', transaction.id).in('payment_status', ['pending', 'processing', 'failed']).select().maybeSingle();
  if (error) return financeFail('db_error', error.message);
  if (!updated) return financeFail('conflict', 'Payment status changed before it could be voided');

  try {
    await logAudit(createAdminClient() as any, {
      action: 'payment_attempt_voided',
      actorId: input.actorId,
      resourceType: 'payment_transaction',
      resourceId: transaction.id,
      tableName: 'payment_transactions',
      oldValue: current,
      newValue: 'failed',
      newValues: {
        reason,
        school_id: transaction.school_id ?? null,
        previous_status: current,
      },
    });
  } catch {
    /* audit is non-fatal */
  }

  return financeOk(updated as Record<string, unknown>, ['payment_attempt_voided', 'ledger_preserved']);
}
