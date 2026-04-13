import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export type BillingCycleInvoiceItem = {
  invoice_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string | null;
  student_name: string | null;
};

/**
 * Open invoices for a school (draft / sent / overdue) to attach to a billing cycle as #4 rollup.
 */
export async function aggregateOpenSchoolInvoices(
  db: SupabaseClient<Database>,
  schoolId: string,
): Promise<{ items: BillingCycleInvoiceItem[]; totalAmount: number; primaryCurrency: string }> {
  const { data: rows, error } = await db
    .from('invoices')
    .select('id, invoice_number, amount, currency, status, portal_user_id, portal_users(full_name)')
    .eq('school_id', schoolId)
    .in('status', ['sent', 'overdue', 'draft'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('aggregateOpenSchoolInvoices:', error.message);
    return { items: [], totalAmount: 0, primaryCurrency: 'NGN' };
  }

  const items: BillingCycleInvoiceItem[] = (rows ?? []).map((r: any) => ({
    invoice_id: r.id,
    invoice_number: r.invoice_number,
    amount: Number(r.amount) || 0,
    currency: String(r.currency || 'NGN').toUpperCase(),
    status: r.status ?? null,
    student_name: r.portal_users?.full_name ?? null,
  }));

  const totalAmount = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const primaryCurrency = items[0]?.currency || 'NGN';
  return { items, totalAmount, primaryCurrency };
}

export function computeSettlementSplit(
  grossAmount: number,
  commissionRatePercent: number,
): { rillcodRetain: number; schoolSettlement: number } {
  const rate = Math.min(100, Math.max(0, commissionRatePercent));
  const rillcodRetain = Math.round(grossAmount * (rate / 100) * 100) / 100;
  const schoolSettlement = Math.round((grossAmount - rillcodRetain) * 100) / 100;
  return { rillcodRetain, schoolSettlement };
}
