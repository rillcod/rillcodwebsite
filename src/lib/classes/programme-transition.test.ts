import { describe, expect, it } from 'vitest';
import {
  buildClassPromotionPlan,
  pickDestinationClass,
} from '@/lib/classes/class-promotion';
import {
  gradeProgrammeTier,
  isYoungToTeenBridge,
  resolveDestinationProgrammeForPromotion,
  TEEN_PROGRAMME,
  YOUNG_PROGRAMME,
} from '@/lib/classes/programme-transition';

describe('programme-transition', () => {
  it('detects Basic 6 → JSS 1 as young-to-teen bridge', () => {
    expect(isYoungToTeenBridge('Basic 6', 'JSS 1')).toBe(true);
    expect(gradeProgrammeTier('Basic 6')).toBe('young');
    expect(gradeProgrammeTier('JSS 1')).toBe('teen');
  });

  it('does not treat Basic 5 → Basic 6 as programme bridge', () => {
    expect(isYoungToTeenBridge('Basic 5', 'Basic 6')).toBe(false);
  });

  it('resolves Teen Developers destination programme on bridge', () => {
    const resolved = resolveDestinationProgrammeForPromotion({
      fromGrade: 'Basic 6',
      toGrade: 'JSS 1',
      sourceProgramId: 'young-id',
      sourceProgramName: YOUNG_PROGRAMME,
      programs: [
        { id: 'young-id', name: YOUNG_PROGRAMME },
        { id: 'teen-id', name: TEEN_PROGRAMME },
      ],
    });
    expect(resolved.programme_transition).toBe(true);
    expect(resolved.programId).toBe('teen-id');
    expect(resolved.programName).toBe(TEEN_PROGRAMME);
  });
});

describe('Basic 6 → JSS 1 class promotion', () => {
  const programs = [
    { id: 'young-id', name: YOUNG_PROGRAMME },
    { id: 'teen-id', name: TEEN_PROGRAMME },
  ];

  const schoolClasses = [
    {
      id: 'young-b6',
      name: 'Franej · Young Innovators · Basic 6',
      school_id: 's1',
      program_id: 'young-id',
      teacher_id: 't1',
      qa_grade_key: 'Basic 6',
    },
    {
      id: 'young-b5',
      name: 'Franej · Young Innovators · Basic 5',
      school_id: 's1',
      program_id: 'young-id',
      teacher_id: 't1',
      qa_grade_key: 'Basic 5',
    },
    {
      id: 'teen-jss1',
      name: 'Franej · Teen Developers · JSS 1',
      school_id: 's1',
      program_id: 'teen-id',
      teacher_id: 't2',
      qa_grade_key: 'JSS 1',
    },
  ] as any[];

  it('pickDestinationClass finds Teen class for JSS 1 when programme is Teen', () => {
    const picked = pickDestinationClass(schoolClasses, {
      schoolId: 's1',
      programId: 'teen-id',
      programName: TEEN_PROGRAMME,
      targetGrade: 'JSS 1',
      excludeClassId: 'young-b6',
    });
    expect(picked?.id).toBe('teen-jss1');
  });

  it('plans Young → Teen graduation for Basic 6 cohort', () => {
    const plan = buildClassPromotionPlan({
      sourceClass: schoolClasses[0],
      students: [{ id: 'u1', full_name: 'Ada', grade: 'Basic 6' }],
      schoolClasses,
      programName: YOUNG_PROGRAMME,
      programs,
    });
    expect(plan.promotable_count).toBe(1);
    expect(plan.has_programme_bridge).toBe(true);
    expect(plan.programme_transition_count).toBe(1);
    expect(plan.moves[0].destination_class_id).toBe('teen-jss1');
    expect(plan.moves[0].to_grade).toBe('JSS 1');
    expect(plan.moves[0].programme_transition).toBe(true);
    expect(plan.moves[0].to_programme).toBe(TEEN_PROGRAMME);
  });

  it('uses a school policy that exits Young at Basic 5', () => {
    const plan = buildClassPromotionPlan({
      sourceClass: schoolClasses[1],
      students: [{ id: 'u2', full_name: 'Tobi', grade: 'Basic 5' }],
      schoolClasses,
      programName: YOUNG_PROGRAMME,
      programs,
      youngToTeenExitGrade: 'Basic 5',
    });
    expect(plan.promotable_count).toBe(1);
    expect(plan.moves[0].to_grade).toBe('JSS 1');
    expect(plan.moves[0].programme_transition).toBe(true);
    expect(plan.moves[0].destination_class_id).toBe('teen-jss1');
  });
});
