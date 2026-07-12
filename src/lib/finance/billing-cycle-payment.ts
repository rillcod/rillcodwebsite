import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { syncRosterBillingForCycle } from '@/lib/rosters/billing-sync';

type FinanceDb = { rpc: (name: string, args: Record<string, unknown>) => any; from: (table: string) => any };

export async function settleBillingCyclePayment(
  db: FinanceDb,
  input: { billingCycleId: string; transactionId: string; actorId?: string | null },
): Promise<FinanceWriteResult<{ billing_cycle_id: string; invoice_id: string; transaction_id: string; status: string }>> {
  const { data, error } = await db.rpc('settle_billing_cycle_payment_atomic', {
    p_billing_cycle_id: input.billingCycleId,
    p_transaction_id: input.transactionId,
    p_actor_id: input.actorId ?? null,
  });
  if (error) return financeFail('db_error', error.message || 'Billing cycle payment settlement failed');
  const result = data as { billing_cycle_id: string; invoice_id: string; transaction_id: string; status: string };
  const roster = await syncRosterBillingForCycle(db as any, input.billingCycleId, 'paid');
  return financeOk(result, ['billing_cycle_paid', 'invoice_paid', 'transaction_linked', 'billing_notice_resolved', ...(roster.ok ? ['roster_billing_paid'] : [])]);
}
