import type { SupabaseClient } from '@supabase/supabase-js';

export type InvoicePaymentAccount = {
  id?: string;
  label?: string | null;
  bank_name: string;
  account_number: string;
  account_name: string;
  payment_note?: string | null;
  is_active?: boolean;
};

type InvoiceAccountReference = {
  metadata?: Record<string, unknown> | null;
};

/**
 * Resolve payment instructions from the invoice's selected account first.
 * The fallback is the current active Rillcod collection accounts. Keeping this
 * in one server helper makes PDF, email, resend, and reminder output agree.
 */
export async function loadInvoicePaymentAccounts(
  db: SupabaseClient,
  invoice: InvoiceAccountReference,
  limit = 3,
): Promise<InvoicePaymentAccount[]> {
  const selectedId =
    typeof invoice.metadata?.pay_to_account_id === 'string'
      ? invoice.metadata.pay_to_account_id.trim()
      : '';
  const columns = 'id, label, bank_name, account_number, account_name, payment_note, is_active';

  if (selectedId) {
    const { data, error } = await db
      .from('payment_accounts')
      .select(columns)
      .eq('id', selectedId)
      .maybeSingle();
    if (error) throw new Error(`Selected payment account could not be loaded: ${error.message}`);
    if (!data) throw new Error('The payment account selected on this invoice no longer exists. Edit the invoice and choose an active account.');
    if (data.is_active === false) {
      throw new Error('The payment account selected on this invoice is inactive. Edit the invoice and choose an active account.');
    }
    return [data as InvoicePaymentAccount];
  }

  const { data, error } = await db
    .from('payment_accounts')
    .select(columns)
    .eq('owner_type', 'rillcod')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 3)));
  if (error) throw new Error(`Payment accounts could not be loaded: ${error.message}`);
  return (data ?? []) as InvoicePaymentAccount[];
}
