import { createAdminClient } from '@/lib/supabase/admin';
import { assertDbOk, financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';

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
  const { data: inv, error: invErr } = await db
    .from('invoices')
    .select('id, original_amount, amount')
    .eq('id', invoiceId)
    .single();
  assertDbOk(invErr, 'load invoice for recompute');

  const { data: rows, error: sumErr } = await (db as any)
    .from('payment_allocations')
    .select('amount')
    .eq('invoice_id', invoiceId);
  assertDbOk(sumErr, 'sum allocations');

  const paid = (rows ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0);
  const original = Number((inv as any).original_amount ?? (inv as any).amount ?? 0);
  const remaining = Math.max(0, original - paid);
  const status = remaining <= 0.01 ? 'paid' : paid > 0 ? 'partially_paid' : undefined;

  const patch: Record<string, unknown> = {
    amount_paid: paid,
    amount_remaining: remaining <= 0.01 ? 0 : remaining,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;

  const { error: upErr } = await db.from('invoices').update(patch as any).eq('id', invoiceId);
  assertDbOk(upErr, 'update invoice balances');
}
