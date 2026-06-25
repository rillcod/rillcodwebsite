import { createClient } from '@supabase/supabase-js';

// Shared school-access resolution. Non-admin staff may belong to a school either
// via portal_users.school_id (school-role partners) OR via the teacher_schools
// junction (teachers can be assigned to several schools). Checking only
// profile.school_id wrongly returns Forbidden for teachers — use these helpers.
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

type StaffProfile = { role?: string | null; school_id?: string | null } | null | undefined;

/** All school IDs the user may act within (own school + any teacher_schools rows). */
export async function getAllowedSchoolIds(userId: string, profile: StaffProfile): Promise<Set<string>> {
  const ids = new Set<string>();
  if (profile?.school_id) ids.add(profile.school_id);
  if (profile?.role === 'teacher') {
    const { data } = await admin().from('teacher_schools').select('school_id').eq('teacher_id', userId);
    for (const r of data ?? []) if ((r as any).school_id) ids.add((r as any).school_id);
  }
  return ids;
}

/** True when the user may act on records belonging to `schoolId`. Admins: always. */
export async function canAccessSchool(userId: string, profile: StaffProfile, schoolId: string | null | undefined): Promise<boolean> {
  if (profile?.role === 'admin') return true;
  if (!schoolId) return false;
  return (await getAllowedSchoolIds(userId, profile)).has(schoolId);
}
