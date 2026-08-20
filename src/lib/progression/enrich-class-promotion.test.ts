import { describe, expect, it } from 'vitest';
import { buildClassPromotionPlan } from '@/lib/classes/class-promotion';
import { enrichPromotionPlanWithIntelligence } from '@/lib/progression/enrich-class-promotion';
import { DEFAULT_PROMOTION_RULES } from '@/lib/progression/promotion-intelligence';

describe('enrichPromotionPlanWithIntelligence', () => {
  it('holds F grades when strict gate is on', () => {
    const base = buildClassPromotionPlan({
      sourceClass: {
        id: 'c1',
        name: 'Basic 1',
        school_id: 's1',
        program_id: 'p1',
        qa_grade_key: 'Basic 1',
      },
      students: [{ id: 'u1', full_name: 'Ada', grade: 'Basic 1' }],
      schoolClasses: [
        { id: 'c1', name: 'Basic 1', school_id: 's1', qa_grade_key: 'Basic 1' },
        { id: 'c2', name: 'Basic 2', school_id: 's1', qa_grade_key: 'Basic 2' },
      ],
    });
    const evidence = new Map([
      ['u1', { overall_score: 35, overall_grade: 'F', attendance_pct: 90 }],
    ]);
    const plan = enrichPromotionPlanWithIntelligence(base, evidence, DEFAULT_PROMOTION_RULES, {
      smart_mode: true,
      strict_class_gate: true,
    });
    expect(plan.promotable_count).toBe(0);
    expect(plan.intelligence.hold).toBe(0);
    expect(plan.moves[0].skipped).toBe(true);
  });

  it('passing score plans class and curriculum', () => {
    const base = buildClassPromotionPlan({
      sourceClass: {
        id: 'c1',
        name: 'Basic 1',
        school_id: 's1',
        qa_grade_key: 'Basic 1',
      },
      students: [{ id: 'u1', full_name: 'Ada', grade: 'Basic 1' }],
      schoolClasses: [
        { id: 'c1', name: 'Basic 1', school_id: 's1', qa_grade_key: 'Basic 1' },
        { id: 'c2', name: 'Basic 2', school_id: 's1', qa_grade_key: 'Basic 2' },
      ],
    });
    const evidence = new Map([
      ['u1', { overall_score: 78, overall_grade: 'B', attendance_pct: 92 }],
    ]);
    const plan = enrichPromotionPlanWithIntelligence(base, evidence, DEFAULT_PROMOTION_RULES, {
      advance_curriculum: 'auto',
    });
    expect(plan.promotable_count).toBe(1);
    expect(plan.moves[0].curriculum_planned).toBe(true);
    expect(plan.intelligence.full).toBe(1);
  });
});
