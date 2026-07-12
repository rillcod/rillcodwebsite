import { createAdminClient } from '@/lib/supabase/admin';
import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';

/**
 * Allocate a completed payment to an invoice (partial-safe, DB-locked).
 */
export async function allocatePaymentToInvoice(input: {
  transactionId: string;
  invoiceId: string;
  amount: number;
  actorId?: string | null;
}): Promise<
  FinanceWriteResult<{
    status: string;
    allocation_id?: string;
    allocated_amount?: number;
    invoice_status?: string;
    amount_paid?: number;
    amount_remaining?: number;
  }>
> {
  const db = createAdminClient();
  const { data, error } = await (db as any).rpc('allocate_payment_to_invoice', {
    p_transaction_id: input.transactionId,
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_actor_id: input.actorId ?? null,
  });

  if (error) {
    const msg = error.message || 'Allocation failed';
    if (/over-allocation|remaining|no remaining/i.test(msg)) {
      return financeFail('over_allocation', msg);
    }
    return financeFail('db_error', msg);
  }

  return financeOk({
    status: String(data?.status || 'allocated'),
    allocation_id: data?.allocation_id,
    allocated_amount: data?.allocated_amount != null ? Number(data.allocated_amount) : undefined,
    invoice_status: data?.invoice_status,
    amount_paid: data?.amount_paid != null ? Number(data.amount_paid) : undefined,
    amount_remaining: data?.amount_remaining != null ? Number(data.amount_remaining) : undefined,
  }, ['payment_allocated']);
}

/** Recompute invoice balances from allocations (repair helper). */
export async function recomputeInvoiceBalances(invoiceId: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await (db as any).rpc('recompute_invoice_balances_atomic', { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message || 'Invoice balance repair failed');
}
