import { describe, expect, it } from 'vitest';
import {
  evaluatePromotionEvidence,
  shouldAdvanceCurriculum,
  DEFAULT_PROMOTION_RULES,
} from '@/lib/progression/promotion-intelligence';

describe('evaluatePromotionEvidence', () => {
  it('holds F grades from class promotion', () => {
    const v = evaluatePromotionEvidence(
      { overall_score: 40, overall_grade: 'F', attendance_pct: 80 },
      DEFAULT_PROMOTION_RULES,
      { strict_class_gate: true },
    );
    expect(v.tier).toBe('hold');
    expect(v.class_promote).toBe(false);
  });

  it('recognizes WAEC F9 and E8 grade codes as hold evidence', () => {
    for (const grade of ['F9', 'E8']) {
      const verdict = evaluatePromotionEvidence(
        { overall_score: 55, overall_grade: grade, attendance_pct: 90 },
        DEFAULT_PROMOTION_RULES,
      );
      expect(verdict.curriculum_advance).toBe(false);
      expect(verdict.tier).toBe('hold');
    }
  });

  it('full pass advances class and curriculum', () => {
    const v = evaluatePromotionEvidence(
      { overall_score: 72, overall_grade: 'B', attendance_pct: 85 },
    );
    expect(v.tier).toBe('full');
    expect(v.class_promote).toBe(true);
    expect(v.curriculum_advance).toBe(true);
  });

  it('conditional pass moves class only', () => {
    const v = evaluatePromotionEvidence(
      { overall_score: 48, overall_grade: 'D', attendance_pct: 90 },
    );
    expect(v.tier).toBe('class_only');
    expect(v.class_promote).toBe(true);
    expect(v.curriculum_advance).toBe(false);
  });

  it('flags fast-track hint for high scores', () => {
    const v = evaluatePromotionEvidence(
      { overall_score: 88, overall_grade: 'A', attendance_pct: 95 },
    );
    expect(v.fast_track_hint).toBe(true);
  });

  it('no report still allows class cohort move', () => {
    const v = evaluatePromotionEvidence(
      { overall_score: null, overall_grade: null, attendance_pct: null },
    );
    expect(v.class_promote).toBe(true);
    expect(v.curriculum_advance).toBe(false);
  });
});

describe('shouldAdvanceCurriculum', () => {
  it('auto mode respects verdict', () => {
    const full = evaluatePromotionEvidence({ overall_score: 70, overall_grade: 'B', attendance_pct: 80 });
    const cond = evaluatePromotionEvidence({ overall_score: 48, overall_grade: 'D', attendance_pct: 80 });
    expect(shouldAdvanceCurriculum(full, 'auto')).toBe(true);
    expect(shouldAdvanceCurriculum(cond, 'auto')).toBe(false);
  });
});
