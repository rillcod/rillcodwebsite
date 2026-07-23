import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateInvoiceItemsTotal, normalizeInvoiceItems } from '@/lib/finance/invoice-input';

type CycleRow = {
  id: string;
  term_label: string;
  term_start_date: string;
  due_date: string;
  amount_due: number;
  currency: string;
  status: string;
};

function cycleStatusForDue(dueDate: string): 'due' | 'past_due' {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today ? 'past_due' : 'due';
}

export async function resolveBillingCycleIdForInvoice(
  admin: SupabaseClient,
  invoice: { id: string; billing_cycle_id?: string | null },
): Promise<string | null> {
  if (invoice.billing_cycle_id) return invoice.billing_cycle_id;
  const { data } = await admin
    .from('billing_cycles')
    .select('id')
    .eq('invoice_id', invoice.id)
    .maybeSingle();
  return data?.id ?? null;
}

/** Keep term invoices and their billing cycles aligned — callers use the invoice API only. */
export async function syncInvoiceFieldsThroughBillingCycle(
  admin: SupabaseClient,
  cycleId: string,
  input: {
    term_label?: string;
    due_date?: string | null;
    amount?: number;
    currency?: string;
    items?: unknown;
    metadata?: Record<string, unknown>;
    notes?: string | null;
    invoice_status?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { data: cycle, error: cycleError } = await admin
    .from('billing_cycles')
    .select('id, term_label, term_start_date, due_date, amount_due, currency, status')
    .eq('id', cycleId)
    .maybeSingle();

  if (cycleError) return { ok: false, error: cycleError.message, status: 500 };
  if (!cycle) return { ok: false, error: 'Linked billing record not found', status: 404 };
  if (cycle.status === 'paid') {
    return { ok: false, error: 'Cannot edit a paid invoice', status: 400 };
  }

  const row = cycle as CycleRow;
  const dueDate = input.due_date ?? row.due_date;
  let amountDue = input.amount ?? row.amount_due;

  if (input.items !== undefined) {
    if (!Array.isArray(input.items)) return { ok: false, error: 'items must be an array', status: 400 };
    const normalized = normalizeInvoiceItems(input.items);
    if (!normalized.ok) return { ok: false, error: normalized.error, status: 400 };
    const itemCheck = calculateInvoiceItemsTotal(normalized.items);
    if (!itemCheck.ok) return { ok: false, error: itemCheck.error, status: 400 };
    if (input.amount === undefined) amountDue = itemCheck.total;
    else if (Math.abs(Number(input.amount) - itemCheck.total) > 0.01) {
      return {
        ok: false,
        error: `Amount (${input.amount}) does not match the sum of line items (${itemCheck.total}).`,
        status: 400,
      };
    }
    input = { ...input, items: normalized.items };
  }

  if (!Number.isFinite(amountDue) || amountDue <= 0) {
    return { ok: false, error: 'amount must be a positive number', status: 400 };
  }

  const invoiceStatus = String(input.invoice_status || '').toLowerCase();
  const cycleStatus =
    invoiceStatus === 'cancelled'
      ? 'cancelled'
      : cycleStatusForDue(String(dueDate));

  const { error } = await (admin as any).rpc('update_billing_cycle_with_invoice', {
    p_cycle_id: cycleId,
    p_term_label: input.term_label?.trim() || row.term_label,
    p_term_start_date: row.term_start_date,
    p_due_date: dueDate,
    p_amount_due: amountDue,
    p_currency: (input.currency ?? row.currency ?? 'NGN').toUpperCase(),
    p_status: cycleStatus,
    p_items: Array.isArray(input.items) ? input.items : null,
    p_metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : null,
    p_notes: typeof input.notes === 'string' ? input.notes : null,
  });

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true };
}
