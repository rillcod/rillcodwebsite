import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/**
 * Ensure a paid `invoices` row exists for a completed billing-cycle payment, so
 * partner-school cycle payments show up in the Finance invoice tab (they only
 * marked the cycle paid before). Idempotent — keyed on payment_transaction_id.
 *
 * Returns the invoice id (existing or new), or null on failure.
 */
export async function ensureBillingCycleInvoice(
  admin: AnySupabase,
  transaction: { id: string; amount: number | string; currency?: string | null; school_id?: string | null; transaction_reference?: string | null; invoice_id?: string | null },
  billingCycleId: string,
): Promise<string | null> {
  try {
    // Already linked / already invoiced?
    if (transaction.invoice_id) return transaction.invoice_id;
    const { data: existing } = await admin
      .from('invoices')
      .select('id')
      .eq('payment_transaction_id', transaction.id)
      .maybeSingle();
    if (existing?.id) return existing.id;

    // Pull a friendly term label for the line item.
    let termLabel: string | null = null;
    try {
      const { data: cycle } = await admin
        .from('billing_cycles')
        .select('term_label')
        .eq('id', billingCycleId)
        .maybeSingle();
      termLabel = (cycle as any)?.term_label ?? null;
    } catch { /* optional */ }

    const amt = Number(transaction.amount) || 0;
    const rawRef = String(transaction.transaction_reference || transaction.id);
    const invoiceNumber = `INV-CYC-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 44)}`;

    const { data: inv, error } = await admin
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        amount: amt,
        currency: transaction.currency || 'NGN',
        status: 'paid',
        due_date: null,
        stream: 'school',
        school_id: transaction.school_id ?? null,
        payment_transaction_id: transaction.id,
        billing_cycle_id: billingCycleId,
        items: [{
          description: termLabel ? `Billing cycle settlement — ${termLabel}` : 'Billing cycle settlement',
          quantity: 1,
          unit_price: amt,
          total: amt,
        }],
        metadata: { source: 'billing_cycle_payment', billing_cycle_id: billingCycleId },
      })
      .select('id')
      .single();

    if (error || !inv?.id) {
      console.error('[ensureBillingCycleInvoice] insert failed:', error?.message);
      return null;
    }

    await admin.from('payment_transactions').update({ invoice_id: inv.id }).eq('id', transaction.id);
    return inv.id;
  } catch (err) {
    console.error('[ensureBillingCycleInvoice] failed:', err);
    return null;
  }
}
