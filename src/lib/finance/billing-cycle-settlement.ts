import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { syncRosterBillingForCycle } from '@/lib/rosters/billing-sync';

type FinanceDb = { from: (table: string) => any };

export async function settleBillingCycle(
  db: FinanceDb,
  billingCycleId: string,
): Promise<FinanceWriteResult<{ id: string; sticky_notice_id: string | null }>> {
  const { data: cycle, error: cycleError } = await db.from('billing_cycles')
    .select('id, status, sticky_notice_id')
    .eq('id', billingCycleId)
    .maybeSingle();
  if (cycleError) return financeFail('db_error', 'Billing cycle lookup failed: ' + cycleError.message);
  if (!cycle) return financeFail('not_found', 'Billing cycle not found');
  if (['cancelled', 'void', 'rolled_over'].includes(String(cycle.status || '').toLowerCase())) {
    return financeFail('invalid_transition', `A ${cycle.status} billing cycle cannot be settled`);
  }

  const effects: string[] = [];
  if (String(cycle.status).toLowerCase() !== 'paid') {
    const { data: updated, error: updateError } = await db.from('billing_cycles')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', billingCycleId)
      .neq('status', 'paid')
      .select('id')
      .maybeSingle();
    if (updateError) return financeFail('db_error', 'Billing cycle settlement failed: ' + updateError.message);
    if (!updated) return financeFail('conflict', 'Billing cycle changed while settlement was in progress');
    effects.push('billing_cycle_paid');
  }

  const rosterResult = await syncRosterBillingForCycle(db as any, billingCycleId, 'paid');
  if (!rosterResult.ok) return financeFail('db_error', 'Billing cycle paid but roster sync failed: ' + rosterResult.error, undefined, { billing_cycle_id: billingCycleId });
  effects.push('roster_billing_paid');

  if (cycle.sticky_notice_id) {
    const { error: noticeError } = await db.from('billing_notices')
      .update({ is_resolved: true, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cycle.sticky_notice_id);
    if (noticeError) return financeFail('db_error', 'Billing cycle paid but notice resolution failed: ' + noticeError.message, undefined, { billing_cycle_id: billingCycleId });
    effects.push('billing_notice_resolved');
  }

  return financeOk({ id: billingCycleId, sticky_notice_id: cycle.sticky_notice_id ?? null }, effects);
}
