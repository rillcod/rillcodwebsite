/** Back-compat shims — prefer promotion-due-intelligence / school-session-promotion */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SmartPromotionOptions } from '@/lib/progression/enrich-class-promotion';

export {
  classEligibleForTeenGraduation,
  isBasic56SectionBand,
  studentDueForTeenGraduation,
} from '@/lib/classes/promotion-due-intelligence';

export {
  scanSchoolPromotionDue,
  scanPromotionDueForSchools,
  summariseSessionPromotionPlan as summariseSchoolGraduationPlan,
  type SchoolSessionPromotionPlan as SchoolTeenGraduationPlan,
} from '@/lib/classes/school-session-promotion';

import { buildSchoolSessionPromotionPlan } from '@/lib/classes/school-session-promotion';

export async function buildSchoolTeenGraduationPlan(
  admin: SupabaseClient,
  schoolId: string,
  smartOpts: SmartPromotionOptions,
) {
  return buildSchoolSessionPromotionPlan(admin, schoolId, 'young_to_teen', smartOpts);
}
