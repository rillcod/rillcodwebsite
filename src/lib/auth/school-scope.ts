import { createClient } from '@supabase/supabase-js';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

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
  return canAccessSchoolSync(profile ?? {}, await getAllowedSchoolIds(userId, profile), schoolId);
}

/**
 * Synchronous counterpart of {@link canAccessSchool} for callers that resolved
 * their allowed school IDs ONCE per request and then check many records
 * (bulk-register loops, list filters, card RBAC).
 *
 * This is the single definition of the rule. Four copies of it previously
 * existed and they did not agree: two denied unscoped (`school_id IS NULL`)
 * records while a third allowed them, so the same record could be readable
 * through one route and Forbidden through another. Unscoped records are DENIED
 * here — a caller that genuinely serves platform-wide rows must special-case
 * that itself rather than relying on a permissive fallthrough.
 */
export function canAccessSchoolSync(
  caller: { role?: string | null },
  allowedSchoolIds: Set<string> | readonly string[],
  schoolId?: string | null,
): boolean {
  if (caller.role === 'admin') return true;
  if (!schoolId) return false;
  return allowedSchoolIds instanceof Set
    ? allowedSchoolIds.has(schoolId)
    : allowedSchoolIds.includes(schoolId);
}

export type SchoolScopeCaller = {
  id: string;
  role: string;
  school_id?: string | null;
};

/** School IDs the caller may operate on (admin → unrestricted). */
export async function getCallerSchoolIds(caller: SchoolScopeCaller): Promise<{
  unrestricted: boolean;
  schoolIds: string[];
}> {
  if (caller.role === 'admin') {
    return { unrestricted: true, schoolIds: [] };
  }
  if (caller.role === 'school') {
    return {
      unrestricted: false,
      schoolIds: caller.school_id ? [caller.school_id] : [],
    };
  }
  if (caller.role === 'teacher') {
    const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id ?? null);
    return { unrestricted: false, schoolIds };
  }
  return { unrestricted: false, schoolIds: [] };
}

export async function assertCallerSchoolAccess(
  caller: SchoolScopeCaller,
  resourceSchoolId: string | null | undefined,
): Promise<boolean> {
  return canAccessSchool(caller.id, caller, resourceSchoolId);
}

export { getTeacherSchoolIds };
