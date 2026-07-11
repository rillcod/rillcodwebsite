import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvoice } from '@/lib/finance/create-invoice';

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
    if (transaction.invoice_id) {
      await admin
        .from('invoices')
        .update({
          status: 'paid',
          amount_paid: Number(transaction.amount) || 0,
          amount_remaining: 0,
          payment_transaction_id: transaction.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.invoice_id);
      return transaction.invoice_id;
    }
    const { data: existing } = await admin
      .from('invoices')
      .select('id')
      .eq('payment_transaction_id', transaction.id)
      .maybeSingle();
    if (existing?.id) return existing.id;

    // Cycle may already have an invoice from create_billing_cycle_with_invoice
    const { data: cycle } = await admin
      .from('billing_cycles')
      .select('term_label, invoice_id')
      .eq('id', billingCycleId)
      .maybeSingle();
    if (cycle?.invoice_id) {
      await admin
        .from('invoices')
        .update({
          status: 'paid',
          amount_paid: Number(transaction.amount) || 0,
          amount_remaining: 0,
          payment_transaction_id: transaction.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cycle.invoice_id);
      await admin.from('payment_transactions').update({ invoice_id: cycle.invoice_id }).eq('id', transaction.id);
      return cycle.invoice_id;
    }

    const amt = Number(transaction.amount) || 0;
    const rawRef = String(transaction.transaction_reference || transaction.id);
    const invoiceNumber = `INV-CYC-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 44)}`;
    const termLabel = (cycle as any)?.term_label ?? null;

    const result = await createInvoice({
      invoice_number: invoiceNumber,
      amount: amt,
      currency: transaction.currency || 'NGN',
      status: 'sent',
      stream: 'school',
      school_id: transaction.school_id ?? null,
      billing_cycle_id: billingCycleId,
      items: [{
        description: termLabel ? `Billing cycle settlement — ${termLabel}` : 'Billing cycle settlement',
        quantity: 1,
        unit_price: amt,
        total: amt,
      }],
      notes: 'Billing cycle payment',
    });

    if (!result.ok) {
      console.error('[ensureBillingCycleInvoice] create failed:', result.error.message);
      return null;
    }

    const invId = String(result.data.id);
    await admin
      .from('invoices')
      .update({
        payment_transaction_id: transaction.id,
        amount_paid: amt,
        amount_remaining: 0,
        status: 'paid',
        metadata: { source: 'billing_cycle_payment', billing_cycle_id: billingCycleId },
        updated_at: new Date().toISOString(),
      })
      .eq('id', invId);
    await admin.from('payment_transactions').update({ invoice_id: invId }).eq('id', transaction.id);
    return invId;
  } catch (err) {
    console.error('[ensureBillingCycleInvoice] failed:', err);
    return null;
  }
}
