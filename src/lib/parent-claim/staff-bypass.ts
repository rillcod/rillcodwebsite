import type { SupabaseClient } from '@supabase/supabase-js';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

type AnySupabase = SupabaseClient<any>;

export type StaffBypassResult = {
  bypass: boolean;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
};

const NONE: StaffBypassResult = { bypass: false, actorId: null, actorName: null, actorRole: null };

/**
 * Logged-in admin / teacher / school staff may bypass the public parent result gate.
 * Teachers and school staff are limited to students in their school(s); admins are global.
 */
export async function resolveStaffResultBypass(
  db: AnySupabase,
  studentSchoolId?: string | null,
): Promise<StaffBypassResult> {
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NONE;
    const { data: profile } = await db
      .from('portal_users')
      .select('role, is_active, full_name, school_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.is_active) return NONE;
    const role = String(profile.role || '');
    if (!['admin', 'teacher', 'school'].includes(role)) return NONE;

    if (role !== 'admin') {
      // Without a school on the student, non-admin staff cannot claim a cross-tenant bypass.
      if (!studentSchoolId) return NONE;
      const schoolIds = await getTeacherSchoolIds(user.id, profile.school_id ?? null);
      if (role === 'school') {
        if (!profile.school_id || profile.school_id !== studentSchoolId) return NONE;
      } else if (!schoolIds.includes(studentSchoolId)) {
        return NONE;
      }
    }

    return {
      bypass: true,
      actorId: user.id,
      actorName: (profile.full_name || '').trim() || null,
      actorRole: role,
    };
  } catch {
    return NONE;
  }
}
