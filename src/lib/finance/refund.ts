import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { syncRosterBillingForCycle, syncRosterBillingForInvoice } from '@/lib/rosters/billing-sync';

type FinanceDb = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };

export async function finalizeFullRefund(
  db: FinanceDb,
  input: { transactionId: string; reason: string; gatewayRefund: Record<string, unknown>; actorId?: string | null },
): Promise<FinanceWriteResult<Record<string, unknown>>> {
  const reason = String(input.reason || '').trim();
  if (reason.length < 3) return financeFail('validation', 'A refund reason is required');
  const { data, error } = await db.rpc('finalize_full_refund_atomic', {
    p_transaction_id: input.transactionId,
    p_reason: reason,
    p_gateway_refund: input.gatewayRefund,
    p_actor_id: input.actorId ?? null,
  });
  if (error) return financeFail('db_error', `Refund could not be finalized atomically: ${error.message}`);
  const result = (data || {}) as Record<string, unknown>;
  const effects = [result.already_refunded ? 'refund_reused' : 'payment_refunded'];
  const warnings: string[] = [];
  if (result.invoice_id) {
    const rosterInvoice = await syncRosterBillingForInvoice(db as any, String(result.invoice_id), String(result.invoice_status || 'sent'));
    if (!rosterInvoice.ok) warnings.push(rosterInvoice.error);
    else effects.push('invoice_roster_reopened');
  }
  if (result.billing_cycle_id) {
    const rosterCycle = await syncRosterBillingForCycle(db as any, String(result.billing_cycle_id), String(result.billing_cycle_status || 'due'));
    if (!rosterCycle.ok) warnings.push(rosterCycle.error);
    else effects.push('billing_cycle_reopened');
  }
  return financeOk({ ...result, ...(warnings.length ? { warnings } : {}) }, effects);
}
