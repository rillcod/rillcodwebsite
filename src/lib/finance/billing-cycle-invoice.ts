import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvoice } from '@/lib/finance/create-invoice';

type AnySupabase = SupabaseClient<any>;

/**
 * Ensure the paid invoice for a completed billing-cycle transaction exists and
 * every cycle/invoice/transaction link is persisted. Returns null on failure so
 * the settlement pipeline can retry the missing post-condition.
 */
export async function ensureBillingCycleInvoice(
  admin: AnySupabase,
  transaction: { id: string; amount: number | string; currency?: string | null; school_id?: string | null; transaction_reference?: string | null; invoice_id?: string | null },
  billingCycleId: string,
): Promise<string | null> {
  try {
    const amount = Number(transaction.amount) || 0;
    if (amount <= 0) throw new Error('Billing-cycle payment amount is invalid');

    if (transaction.invoice_id) {
      const { error } = await admin.from('invoices').update({
        status: 'paid',
        original_amount: amount,
        amount_paid: amount,
        amount_remaining: 0,
        payment_transaction_id: transaction.id,
        updated_at: new Date().toISOString(),
      }).eq('id', transaction.invoice_id);
      if (error) throw new Error('Could not settle linked invoice: ' + error.message);
      return transaction.invoice_id;
    }

    const { data: existing, error: existingError } = await admin.from('invoices')
      .select('id')
      .eq('payment_transaction_id', transaction.id)
      .maybeSingle();
    if (existingError) throw new Error('Could not inspect transaction invoice: ' + existingError.message);
    if (existing?.id) return existing.id;

    const { data: cycle, error: cycleError } = await admin.from('billing_cycles')
      .select('term_label, invoice_id')
      .eq('id', billingCycleId)
      .maybeSingle();
    if (cycleError) throw new Error('Could not load billing cycle invoice: ' + cycleError.message);
    if (!cycle) throw new Error('Billing cycle not found');

    if (cycle.invoice_id) {
      const { error: invoiceError } = await admin.from('invoices').update({
        status: 'paid',
        original_amount: amount,
        amount_paid: amount,
        amount_remaining: 0,
        payment_transaction_id: transaction.id,
        updated_at: new Date().toISOString(),
      }).eq('id', cycle.invoice_id);
      if (invoiceError) throw new Error('Could not settle cycle invoice: ' + invoiceError.message);
      const { error: transactionError } = await admin.from('payment_transactions')
        .update({ invoice_id: cycle.invoice_id, updated_at: new Date().toISOString() })
        .eq('id', transaction.id);
      if (transactionError) throw new Error('Could not link payment to cycle invoice: ' + transactionError.message);
      return cycle.invoice_id;
    }

    const rawRef = String(transaction.transaction_reference || transaction.id);
    const invoiceNumber = `INV-CYC-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 44)}`;
    const result = await createInvoice({
      invoice_number: invoiceNumber,
      amount,
      currency: transaction.currency || 'NGN',
      status: 'sent',
      stream: 'school',
      school_id: transaction.school_id ?? null,
      billing_cycle_id: billingCycleId,
      items: [{
        description: cycle.term_label ? `Billing cycle settlement — ${cycle.term_label}` : 'Billing cycle settlement',
        quantity: 1,
        unit_price: amount,
        total: amount,
      }],
      notes: 'Billing cycle payment',
    });
    if (!result.ok) throw new Error(result.error.message);

    const invoiceId = String(result.data.id);
    const { error: settleError } = await admin.from('invoices').update({
      payment_transaction_id: transaction.id,
      original_amount: amount,
      amount_paid: amount,
      amount_remaining: 0,
      status: 'paid',
      metadata: { source: 'billing_cycle_payment', billing_cycle_id: billingCycleId },
      updated_at: new Date().toISOString(),
    }).eq('id', invoiceId);
    if (settleError) throw new Error('Could not settle new cycle invoice: ' + settleError.message);

    const { error: transactionError } = await admin.from('payment_transactions')
      .update({ invoice_id: invoiceId, updated_at: new Date().toISOString() })
      .eq('id', transaction.id);
    if (transactionError) throw new Error('Could not link payment to new cycle invoice: ' + transactionError.message);
    return invoiceId;
  } catch (error) {
    console.error('[ensureBillingCycleInvoice] failed:', error);
    return null;
  }
}
