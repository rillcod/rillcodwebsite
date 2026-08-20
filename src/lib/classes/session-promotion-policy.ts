import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE,
  type YoungToTeenExitGrade,
} from '@/lib/classes/programme-transition';
import {
  loadPromotionRules,
  type PromotionSettings,
} from '@/lib/progression/promotion-settings';

export type SchoolSessionPromotionPolicy = {
  young_to_teen_exit_grade: YoungToTeenExitGrade;
};

export const DEFAULT_SCHOOL_SESSION_PROMOTION_POLICY: SchoolSessionPromotionPolicy = {
  young_to_teen_exit_grade: DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE,
};

function parseExitGrade(raw: unknown): YoungToTeenExitGrade | null {
  if (raw === 'Basic 5' || raw === 'Basic 6') return raw;
  return null;
}

export function resolveSchoolSessionPromotionPolicy(
  settings: PromotionSettings,
  schoolId: string,
): SchoolSessionPromotionPolicy {
  const schoolOverride = settings.school_young_to_teen_exit_grade?.[schoolId];
  const exit =
    parseExitGrade(schoolOverride)
    ?? parseExitGrade(settings.young_to_teen_exit_grade)
    ?? DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE;
  return { young_to_teen_exit_grade: exit };
}

export async function loadSchoolSessionPromotionPolicy(
  db: SupabaseClient,
  schoolId: string,
): Promise<SchoolSessionPromotionPolicy> {
  const settings = await loadPromotionRules(db);
  return resolveSchoolSessionPromotionPolicy(settings, schoolId);
}

export async function loadSchoolSessionPromotionPolicies(
  db: SupabaseClient,
  schoolIds: string[],
): Promise<Map<string, SchoolSessionPromotionPolicy>> {
  const settings = await loadPromotionRules(db);
  const map = new Map<string, SchoolSessionPromotionPolicy>();
  for (const schoolId of schoolIds) {
    map.set(schoolId, resolveSchoolSessionPromotionPolicy(settings, schoolId));
  }
  return map;
}
