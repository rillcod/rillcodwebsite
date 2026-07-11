import { createAdminClient } from '@/lib/supabase/admin';
import { assertDbOk } from '@/lib/finance/write-result';

/**
 * Mark open past-due invoices as overdue. Shared by crons and APIs.
 */
export async function markOverdueInvoices(asOf = new Date()): Promise<{ updated: number }> {
  const db = createAdminClient();
  const iso = asOf.toISOString().slice(0, 10);
  const { data, error } = await db
    .from('invoices')
    .update({ status: 'overdue', updated_at: new Date().toISOString() })
    .in('status', ['sent', 'pending', 'partially_paid', 'draft'])
    .lt('due_date', iso)
    .gt('amount_remaining', 0)
    .select('id');

  // Fallback if amount_remaining column not yet migrated on older envs
  if (error && /amount_remaining/i.test(error.message)) {
    const { data: legacy, error: legacyErr } = await db
      .from('invoices')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .in('status', ['sent', 'pending', 'partially_paid', 'draft'])
      .lt('due_date', iso)
      .select('id');
    assertDbOk(legacyErr, 'mark overdue invoices (legacy)');
    return { updated: legacy?.length ?? 0 };
  }

  assertDbOk(error, 'mark overdue invoices');
  return { updated: data?.length ?? 0 };
}
