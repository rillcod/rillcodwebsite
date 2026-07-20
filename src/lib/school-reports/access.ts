import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherManageableSchoolIds } from '@/lib/school-reports/registry';

export async function getSchoolReportActor() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin.from('portal_users')
    .select('id,full_name,role,school_id,is_active,is_deleted')
    .eq('id', user.id).maybeSingle();
  if (!profile?.is_active || profile.is_deleted || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  let schoolIds: string[] = [];
  if (profile.role === 'teacher') {
    schoolIds = await getTeacherManageableSchoolIds(admin, profile.id, profile.school_id);
  } else if (profile.school_id) {
    schoolIds = [profile.school_id];
  }
  return { user, profile, admin, schoolIds };
}

export function canManageSchoolReport(actor: NonNullable<Awaited<ReturnType<typeof getSchoolReportActor>>>, schoolId: string) {
  return actor.profile.role === 'admin' || (actor.profile.role === 'teacher' && actor.schoolIds.includes(schoolId));
}

export function canViewSchoolReport(actor: NonNullable<Awaited<ReturnType<typeof getSchoolReportActor>>>, report: { school_id: string; status: string }) {
  if (canManageSchoolReport(actor, report.school_id)) return true;
  return actor.profile.role === 'school' && actor.schoolIds.includes(report.school_id) && report.status === 'published';
}
