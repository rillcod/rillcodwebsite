import { createAdminClient } from '@/lib/supabase/admin';
import { classifyInvoiceStream } from '@/lib/finance/streams';
import { calculateInvoiceItemsTotal, validateInvoiceInput } from '@/lib/finance/invoice-input';
import { assertDbOk, financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { toJson } from '@/lib/supabase/json';
import type { Json } from '@/types/supabase';

export type CreateInvoiceInput = {
  school_id?: string | null;
  portal_user_id?: string | null;
  billing_cycle_id?: string | null;
  subscription_id?: string | null;
  amount: number;
  currency?: string;
  due_date?: string | null;
  items?: unknown[];
  notes?: string | null;
  description?: string | null;
  status?: string;
  stream?: 'school' | 'individual';
  invoice_number?: string;
  metadata?: Record<string, Json | undefined> | Json;
};

function buildInvoiceNumber(prefix = 'INV'): string {
  return `${prefix}-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Single entry point for invoice creation across APIs and billing-cycle flows.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
  opts?: { linkBillingCycle?: boolean },
): Promise<FinanceWriteResult<Record<string, unknown>>> {
  const validated = validateInvoiceInput({
    amount: input.amount,
    currency: input.currency ?? 'NGN',
    status: input.status ?? 'draft',
    due_date: input.due_date,
    items: input.items,
  });
  if (!validated.ok) return financeFail('validation', validated.error);

  if (!input.school_id && !input.portal_user_id) {
    return financeFail('validation', 'school_id or portal_user_id required');
  }

  const db = createAdminClient();
  const linkBillingCycle = opts?.linkBillingCycle !== false;

  if (input.billing_cycle_id) {
    const { data: cycle, error: cycleErr } = await db
      .from('billing_cycles')
      .select('id, school_id, owner_school_id, owner_user_id, invoice_id')
      .eq('id', input.billing_cycle_id)
      .maybeSingle();
    if (cycleErr) return financeFail('db_error', 'Failed to look up billing cycle: ' + cycleErr.message);
    if (!cycle) return financeFail('not_found', 'Billing cycle not found');
    const cycleSchoolId = cycle.owner_school_id ?? cycle.school_id ?? null;
    if (input.school_id && cycleSchoolId && input.school_id !== cycleSchoolId) return financeFail('validation', 'Invoice school does not match billing cycle owner');
    if (input.portal_user_id && cycle.owner_user_id && input.portal_user_id !== cycle.owner_user_id) return financeFail('validation', 'Invoice payer does not match billing cycle owner');
    if (cycle.invoice_id) {
      return financeFail('conflict', 'Billing cycle already has an invoice', { invoice_id: cycle.invoice_id });
    }
  }

  const amount = Number(validated.amount);
  const currency = String(validated.currency || input.currency || 'NGN').toUpperCase();
  const status = String(input.status ?? 'draft');
  const invoiceItems =
    Array.isArray(input.items) && input.items.length > 0
      ? input.items
      : [
          {
            description: input.description ?? (input.subscription_id ? 'Subscription Fee' : 'Invoice'),
            quantity: 1,
            unit_price: amount,
            total: amount,
          },
        ];

  const itemCheck = calculateInvoiceItemsTotal(invoiceItems);
  if (!itemCheck.ok) return financeFail('validation', itemCheck.error);
  if (Math.abs(itemCheck.total - amount) > 0.01) {
    return financeFail('validation', `Invoice amount (${amount}) must equal line-item total (${itemCheck.total})`);
  }

  const metadataObject =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, any>)
      : {};

  const stream =
    input.stream ??
    classifyInvoiceStream({
      school_id: input.school_id ?? null,
      portal_user_id: input.portal_user_id ?? null,
      billing_cycle_id: input.billing_cycle_id ?? null,
      metadata: metadataObject,
    });

  const invoice_number = input.invoice_number || buildInvoiceNumber();

  const { data: created, error: invErr } = await (db as any).rpc('create_invoice_atomic', {
    p_invoice_number: invoice_number, p_school_id: input.school_id ?? null, p_portal_user_id: input.portal_user_id ?? null,
    p_amount: amount, p_currency: currency, p_status: status, p_due_date: validated.dueDate ?? input.due_date ?? null,
    p_items: toJson(invoiceItems), p_notes: input.notes ?? null, p_stream: stream,
    p_billing_cycle_id: linkBillingCycle ? input.billing_cycle_id ?? null : null, p_metadata: toJson(metadataObject),
  });
  if (invErr) return financeFail('db_error', invErr.message);
  const invoiceId = created?.invoice_id;
  if (!invoiceId) return financeFail('db_error', 'Invoice RPC returned no invoice_id');
  const { data: invoice, error: reloadError } = await db.from('invoices').select('*').eq('id', invoiceId).single();
  if (reloadError || !invoice) return financeFail('db_error', reloadError?.message || 'Invoice could not be reloaded');
  const effects: string[] = ['invoice_created', ...(linkBillingCycle && input.billing_cycle_id ? ['billing_cycle_linked'] : [])];

  return financeOk(invoice as Record<string, unknown>, effects);
}

/**
 * Create billing cycle + linked invoice in one DB transaction via RPC.
 */
export async function createBillingCycleWithInvoice(input: {
  owner_type: 'school' | 'individual';
  owner_school_id?: string | null;
  owner_user_id?: string | null;
  term_label: string;
  term_start_date: string;
  due_date: string;
  amount_due: number;
  currency?: string;
  status?: 'due' | 'past_due';
  items?: unknown;
  subscription_id?: string | null;
  actor_id?: string | null;
}): Promise<FinanceWriteResult<{ cycle: Record<string, unknown>; invoice: Record<string, unknown> }>> {
  const db = createAdminClient();
  const { data, error } = await (db as any).rpc('create_billing_cycle_with_invoice', {
    p_owner_type: input.owner_type,
    p_owner_school_id: input.owner_school_id ?? null,
    p_owner_user_id: input.owner_user_id ?? null,
    p_term_label: input.term_label,
    p_term_start_date: input.term_start_date,
    p_due_date: input.due_date,
    p_amount_due: input.amount_due,
    p_currency: (input.currency || 'NGN').toUpperCase(),
    p_status: input.status || 'due',
    p_items: input.items ?? [],
    p_subscription_id: input.subscription_id ?? null,
    p_actor_id: input.actor_id ?? null,
  });

  if (error) return financeFail('db_error', error.message);

  const cycleId = data?.cycle_id as string | undefined;
  const invoiceId = data?.invoice_id as string | undefined;
  if (!cycleId || !invoiceId) {
    return financeFail('db_error', 'RPC did not return cycle_id/invoice_id', data);
  }

  const [{ data: cycle, error: cErr }, { data: invoice, error: iErr }] = await Promise.all([
    db.from('billing_cycles').select('*').eq('id', cycleId).single(),
    db.from('invoices').select('*').eq('id', invoiceId).single(),
  ]);
  assertDbOk(cErr, 'reload billing cycle');
  assertDbOk(iErr, 'reload invoice');

  return financeOk(
    { cycle: cycle as Record<string, unknown>, invoice: invoice as Record<string, unknown> },
    ['billing_cycle_created', 'invoice_created', 'billing_cycle_linked'],
  );
}
