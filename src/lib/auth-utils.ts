import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * THE definition of "which schools may this staff member act within" — primary
 * `school_id` plus every `teacher_schools` assignment.
 *
 * @param client Optional service-role client. Callers that already hold one
 *   (live sessions, batch jobs) should pass it instead of making this open a
 *   second connection per call.
 */
export async function getTeacherSchoolIds(
  userId: string,
  primarySchoolId: string | null,
  client?: SupabaseClient<any>,
): Promise<string[]> {
  const ids: string[] = [];
  if (primarySchoolId) ids.push(primarySchoolId);

  const admin = client ?? adminClient();
  const { data: ts, error } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', userId);

  // Fail loudly. Swallowing this silently narrows the teacher to their primary
  // school, which is indistinguishable from having genuinely been un-assigned —
  // the campus just disappears from their dashboard with no error anywhere.
  if (error) throw error;

  (ts ?? []).forEach((r: any) => {
    if (r.school_id && !ids.includes(r.school_id)) {
      ids.push(r.school_id);
    }
  });

  return ids;
}

// NOTE: a `canAccessSchool` used to live here too, but it was unreferenced and
// disagreed with every other copy (it ALLOWED records with a null school_id).
// The single definition now lives in `@/lib/auth/school-scope` — import
// `canAccessSchool` (async) or `canAccessSchoolSync` (pre-resolved IDs) instead
// of reintroducing a local variant.
