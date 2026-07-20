import type { SupabaseClient } from '@supabase/supabase-js';

export type SchoolReportPaymentAccount = {
  id?: string;
  label: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  paymentNote?: string | null;
};

export function mapPaymentAccountRow(row: Record<string, unknown>): SchoolReportPaymentAccount {
  return {
    id: row.id ? String(row.id) : undefined,
    label: String(row.label || row.bank_name || 'Rillcod account').trim(),
    bankName: String(row.bank_name || '').trim(),
    accountNumber: String(row.account_number || '').trim(),
    accountName: String(row.account_name || '').trim(),
    paymentNote: row.payment_note ? String(row.payment_note) : null,
  };
}

/** Company bank accounts used on school invoices and report payment blocks. */
export async function loadSchoolReportPaymentAccounts(
  admin: SupabaseClient<any>,
): Promise<SchoolReportPaymentAccount[]> {
  const { data } = await     admin
      .from('payment_accounts')
      .select('id, label, bank_name, account_number, account_name, payment_note')
    .eq('is_active', true)
    .is('school_id', null)
    .order('created_at', { ascending: false })
    .limit(3);
  return ((data ?? []) as Record<string, unknown>[])
    .map(mapPaymentAccountRow)
    .filter((row) => row.accountNumber.length > 0);
}
