import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * "Class Privacy for Teachers" (app_settings.lms_teacher_isolation). When ON, a teacher sees
 * ONLY their own classes and the students/records inside them — not everything in a shared
 * school. When OFF, teachers see all classes/records in the schools they're assigned to.
 *
 * This is the single reader so every surface (classes, student list, CRM, attendance) applies
 * the same rule. Fails safe to OFF if the setting can't be read.
 */
export async function isTeacherIsolationOn(admin: SupabaseClient<any>): Promise<boolean> {
  try {
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'lms_teacher_isolation')
      .maybeSingle();
    return (data as { value?: string } | null)?.value === 'true';
  } catch {
    return false;
  }
}
