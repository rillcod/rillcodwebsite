import {
  DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE,
  type YoungToTeenExitGrade,
} from '@/lib/classes/programme-transition';
import type { PromotionSettings } from '@/lib/progression/promotion-settings';

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
): SchoolSessionPromotionPolicy {
  const exit =
    parseExitGrade(settings.young_to_teen_exit_grade)
    ?? DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE;
  return { young_to_teen_exit_grade: exit };
}
