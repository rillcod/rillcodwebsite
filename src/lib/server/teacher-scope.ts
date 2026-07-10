import type { SupabaseClient } from '@supabase/supabase-js';
import { getBoolSetting } from './app-settings';
import { LMS_POLICY_DEFAULTS } from './lms-policy';

/**
 * "Class Privacy for Teachers" (app_settings.lms_teacher_isolation). When ON, a teacher sees
 * ONLY their own classes and the students/records inside them — not everything in a shared
 * school. When OFF, teachers see all classes/records in the schools they're assigned to.
 *
 * Single reader — delegates to the shared getBoolSetting so there is ONE settings-read path
 * (no duplicated app_settings queries) and one default, defined in lms-policy.
 */
export function isTeacherIsolationOn(admin: SupabaseClient<any>): Promise<boolean> {
  return getBoolSetting(admin, 'lms_teacher_isolation', LMS_POLICY_DEFAULTS.teacherIsolation);
}
