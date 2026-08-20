import { describe, expect, it } from 'vitest';
import {
  resolveSchoolSessionPromotionPolicy,
} from '@/lib/classes/session-promotion-policy';
import { schoolPromotionSettingsKey } from '@/lib/progression/promotion-settings';
import { DEFAULT_PROMOTION_RULES } from '@/lib/progression/promotion-intelligence';

describe('school session promotion policy', () => {
  it('accepts Basic 5 as a school exit grade', () => {
    expect(resolveSchoolSessionPromotionPolicy({
      ...DEFAULT_PROMOTION_RULES,
      young_to_teen_exit_grade: 'Basic 5',
    }).young_to_teen_exit_grade).toBe('Basic 5');
  });

  it('falls back safely when stored data is invalid', () => {
    expect(resolveSchoolSessionPromotionPolicy({
      ...DEFAULT_PROMOTION_RULES,
      young_to_teen_exit_grade: 'Basic 7' as 'Basic 6',
    }).young_to_teen_exit_grade).toBe('Basic 6');
  });

  it('uses an isolated settings row per school', () => {
    expect(schoolPromotionSettingsKey('school-1')).toBe('lms.ops.promotion.school.school-1');
    expect(schoolPromotionSettingsKey('school-2')).not.toBe(schoolPromotionSettingsKey('school-1'));
  });
});
