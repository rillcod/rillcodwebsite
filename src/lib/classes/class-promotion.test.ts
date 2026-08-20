import { describe, expect, it } from 'vitest';
import {
  buildClassPromotionPlan,
  inferClassGradeAnchor,
  nextSingleGrade,
  pickDestinationClass,
} from '@/lib/classes/class-promotion';

describe('nextSingleGrade', () => {
  it('steps Basic 1 to Basic 2', () => {
    expect(nextSingleGrade('Basic 1')).toBe('Basic 2');
  });

  it('steps JSS 3 to SS 1', () => {
    expect(nextSingleGrade('JSS 3')).toBe('SS 1');
  });

  it('returns null at top of ladder', () => {
    expect(nextSingleGrade('SS 3')).toBeNull();
  });
});

describe('inferClassGradeAnchor', () => {
  it('reads qa_grade_key first', () => {
    expect(inferClassGradeAnchor({ qa_grade_key: 'Basic 1', name: 'School · Prog · Basic 1-3' })).toBe('Basic 1');
  });
});

describe('pickDestinationClass', () => {
  const classes = [
    { id: 'src', name: 'A · Basic 1', school_id: 's1', program_id: 'p1', teacher_id: 't1', qa_grade_key: 'Basic 1' },
    { id: 'dest-owned', name: 'A · Basic 2', school_id: 's1', program_id: 'p1', teacher_id: 't1', qa_grade_key: 'Basic 2' },
    { id: 'dest-other', name: 'A · Basic 2 B', school_id: 's1', program_id: 'p1', teacher_id: 't2', qa_grade_key: 'Basic 2' },
  ] as any[];

  it('prefers destination owned by same teacher', () => {
    const picked = pickDestinationClass(classes, {
      schoolId: 's1',
      programId: 'p1',
      targetGrade: 'Basic 2',
      preferTeacherId: 't1',
      excludeClassId: 'src',
    });
    expect(picked?.id).toBe('dest-owned');
  });
});

describe('buildClassPromotionPlan', () => {
  it('plans bulk moves for every active student', () => {
    const plan = buildClassPromotionPlan({
      sourceClass: {
        id: 'c1',
        name: 'Franej · Young Innov · Basic 1',
        school_id: 's1',
        program_id: 'p1',
        teacher_id: 't1',
        qa_grade_key: 'Basic 1',
      },
      students: [
        { id: 'u1', full_name: 'Ada', grade: 'Basic 1' },
        { id: 'u2', full_name: 'Ben', grade: 'Basic 1' },
      ],
      schoolClasses: [
        { id: 'c1', name: 'Franej · Young Innov · Basic 1', school_id: 's1', program_id: 'p1', teacher_id: 't1', qa_grade_key: 'Basic 1' },
        { id: 'c2', name: 'Franej · Young Innov · Basic 2', school_id: 's1', program_id: 'p1', teacher_id: 't1', qa_grade_key: 'Basic 2' },
      ],
    });
    expect(plan.promotable_count).toBe(2);
    expect(plan.moves.every((m) => m.destination_class_id === 'c2')).toBe(true);
    expect(plan.moves.every((m) => m.to_grade === 'Basic 2')).toBe(true);
  });
});
