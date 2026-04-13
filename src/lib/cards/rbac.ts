import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StaffRole = 'admin' | 'teacher' | 'school';

export type StaffContext = {
  id: string;
  role: StaffRole;
  school_id: string | null;
  school_ids: string[];
};

function isStaffRole(value: string | null | undefined): value is StaffRole {
  return value === 'admin' || value === 'teacher' || value === 'school';
}

export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile || !isStaffRole(profile.role)) return null;

  const schoolIds = new Set<string>();
  if (profile.school_id) schoolIds.add(profile.school_id);

  if (profile.role === 'teacher') {
    const { data: rows, error: rowsErr } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', profile.id);
    if (!rowsErr) {
      for (const r of rows || []) {
        const sid = (r as { school_id: string | null }).school_id;
        if (sid) schoolIds.add(sid);
      }
    }
  }

  return {
    id: profile.id,
    role: profile.role,
    school_id: profile.school_id,
    school_ids: Array.from(schoolIds),
  };
}

export function canAccessSchool(ctx: StaffContext, schoolId: string | null | undefined): boolean {
  if (ctx.role === 'admin') return true;
  if (!schoolId) return false;
  return ctx.school_ids.includes(schoolId);
}

