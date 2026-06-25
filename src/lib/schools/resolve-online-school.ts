import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Single source of truth for "which school does a school-less student belong to".
 *
 * Every onboarding path (manual activation, student approval, summer-school
 * prospect approval, and the Paystack webhook) needs to guarantee a student
 * ends up attached to a school — the platform cannot operate without one.
 *
 * Previously each route inlined `ilike('%online%') + status = 'approved'` and,
 * on a miss, created a brand-new "Rillcod Online School". That had two bugs:
 *   1. If the operator's own "Online School" record was NOT yet `approved`
 *      (e.g. still `pending`), the lookup missed it and a *duplicate* school
 *      was created — silently splitting students across two records.
 *   2. The logic was copy-pasted in 4 places, so fixes had to be made 4×.
 *
 * This resolver fixes both:
 *   • It matches an existing "online" school regardless of status, and
 *     self-heals it to `approved` so future lookups are clean.
 *   • It only creates a school as a last resort, and reuses the canonical
 *     "Rillcod Online School" name to avoid accidental duplicates.
 */

const ONLINE_SCHOOL_NAME = 'Rillcod Online School';

export interface ResolvedSchool {
  id: string;
  name: string;
}

/**
 * Resolve the school a student should be attached to.
 *
 * @param admin   Service-role Supabase client (bypasses RLS).
 * @param current Any school already known for the student. If `id` is present
 *                it is trusted and returned as-is (with a best-effort name).
 */
export async function resolveOnlineSchool(
  admin: SupabaseClient,
  current?: { id?: string | null; name?: string | null },
): Promise<ResolvedSchool> {
  // 1. Student already has a concrete school — keep it. CRITICAL: never assume the
  //    online name here. If the caller didn't pass a name, look up the school's REAL
  //    name; defaulting to ONLINE_SCHOOL_NAME stamped "Rillcod Online School" onto
  //    students who actually belong to a local school (their school_id was correct,
  //    only the denormalised school_name was wrong).
  if (current?.id) {
    if (current.name && current.name.trim()) return { id: current.id, name: current.name };
    const { data: s } = await admin.from('schools').select('name').eq('id', current.id).maybeSingle();
    return { id: current.id, name: (s as { name?: string } | null)?.name ?? current.name ?? '' };
  }

  // 2. Find an existing "online" school by name, regardless of status.
  //    Prefer an approved one; otherwise self-heal the first match to approved.
  const { data: matches } = await admin
    .from('schools')
    .select('id, name, status')
    .ilike('name', '%online%')
    .order('created_at', { ascending: true });

  const list = (matches ?? []) as Array<{ id: string; name: string; status: string | null }>;
  if (list.length > 0) {
    const approved = list.find((s) => s.status === 'approved');
    const chosen = approved ?? list[0];
    if (!approved) {
      await admin.from('schools').update({ status: 'approved' }).eq('id', chosen.id);
    }
    return { id: chosen.id, name: chosen.name ?? ONLINE_SCHOOL_NAME };
  }

  // 3. Nothing matched — reuse the canonical name if it somehow exists
  //    (defensive: avoids a duplicate if a prior row lost its "online" token),
  //    otherwise create it.
  const { data: existingByName } = await admin
    .from('schools')
    .select('id, name')
    .eq('name', ONLINE_SCHOOL_NAME)
    .limit(1)
    .maybeSingle();

  if (existingByName) {
    await admin.from('schools').update({ status: 'approved' }).eq('id', existingByName.id);
    return { id: existingByName.id, name: existingByName.name ?? ONLINE_SCHOOL_NAME };
  }

  const { data: created, error } = await admin
    .from('schools')
    .insert({ name: ONLINE_SCHOOL_NAME, status: 'approved' })
    .select('id, name')
    .single();

  if (error || !created) {
    throw new Error(`Failed to resolve or create the online school: ${error?.message ?? 'unknown error'}`);
  }
  return { id: created.id, name: created.name ?? ONLINE_SCHOOL_NAME };
}

export { ONLINE_SCHOOL_NAME };
