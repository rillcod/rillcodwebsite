import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrCreateStudentRowId, syncExplicitParentStudentLink } from '@/lib/parents/links';
import type { ConsentAccessStatus } from '@/lib/consent/result-access';

type AnySupabase = SupabaseClient<any>;

/**
 * When consent is complete but parent_student_links was never written (common when
 * staff matched the form before portal creation), backfill the link from the matched
 * lead so `isParentCaptured` and the gate response stay consistent.
 */
export async function backfillParentLinkFromConsent(
  admin: AnySupabase,
  studentUserId: string,
  consent: ConsentAccessStatus,
): Promise<void> {
  if (!consent.complete || !consent.matchedLeadId) return;
  try {
    const { data: lead } = await admin
      .from('form_leads')
      .select('matched_parent_id')
      .eq('id', consent.matchedLeadId)
      .maybeSingle();
    if (!lead?.matched_parent_id) return;

    const childRowId = await resolveOrCreateStudentRowId(admin, studentUserId);
    if (childRowId) {
      await syncExplicitParentStudentLink(admin, lead.matched_parent_id, childRowId);
    }
  } catch (err) {
    console.warn('[consent-backfill] parent link backfill failed (non-fatal):', err);
  }
}
