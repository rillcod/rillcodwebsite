import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrCreateStudentRowId } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

const VALID_GENDERS = new Set(['male', 'female']);

/** Normalise parent-supplied gender to the values used across consent forms. */
export function normaliseChildGender(raw: string | null | undefined): 'male' | 'female' | null {
  const g = String(raw ?? '').trim().toLowerCase();
  return VALID_GENDERS.has(g) ? (g as 'male' | 'female') : null;
}

/** True when the student row has no gender on file yet. */
export async function studentNeedsGender(admin: AnySupabase, studentUserId: string): Promise<boolean> {
  try {
    const { data: row } = await admin
      .from('students')
      .select('gender')
      .eq('user_id', studentUserId)
      .maybeSingle();
    return !String(row?.gender ?? '').trim();
  } catch {
    return false;
  }
}

/**
 * Fill-only: parent-supplied gender is written when the student record is blank.
 * Mirrors consent-form review — never overwrite staff/parent data already on file.
 */
export async function applyParentSuppliedChildGender(
  admin: AnySupabase,
  studentUserId: string,
  rawGender: string | null | undefined,
): Promise<boolean> {
  const gender = normaliseChildGender(rawGender);
  if (!gender) return false;

  const childRowId = await resolveOrCreateStudentRowId(admin, studentUserId);
  if (!childRowId) return false;

  const { data: existing } = await admin
    .from('students')
    .select('gender')
    .eq('id', childRowId)
    .maybeSingle();
  if (String(existing?.gender ?? '').trim()) return false;

  const now = new Date().toISOString();
  await admin.from('students').update({ gender, updated_at: now }).eq('id', childRowId);

  // Best-effort sync to portal_users when the column exists.
  try {
    await admin.from('portal_users').update({ gender, updated_at: now }).eq('id', studentUserId);
  } catch { /* column may be absent in some envs */ }

  return true;
}
