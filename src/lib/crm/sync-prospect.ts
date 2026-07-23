import { createAdminClient } from '@/lib/supabase/admin';
import { captureProspectEnrollment } from '@/lib/crm/intake-capture';

/** @deprecated Use captureProspectEnrollment from intake-capture directly. */
export async function harnessProspectToContactBook(prospectId: string, authUserId?: string | null) {
  const admin = createAdminClient();

  const { data: record, error: fetchErr } = await admin
    .from('prospective_students')
    .select('*')
    .eq('id', prospectId)
    .maybeSingle();

  if (fetchErr || !record) {
    console.error(`Failed to fetch prospective student ${prospectId} for contact book sync:`, fetchErr);
    return;
  }

  try {
    await captureProspectEnrollment(admin as any, record as Record<string, unknown>, authUserId);
  } catch (err) {
    console.error('[harnessProspectToContactBook] intake sync failed:', err);
  }
}
