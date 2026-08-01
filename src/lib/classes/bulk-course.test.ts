import { describe, expect, it } from 'vitest';
import { planBulkCourseAssignment, type BulkCourseCandidate } from './bulk-course';

const YOUNG = 'prog-young';
const TEEN = 'prog-teen';
const SCRATCH = { id: 'course-scratch', program_id: YOUNG };

const klass = (over: Partial<BulkCourseCandidate> = {}): BulkCourseCandidate => ({
  id: 'c1',
  name: 'A class',
  program_id: YOUNG,
  current_course_id: null,
  ...over,
});

describe('planBulkCourseAssignment', () => {
  it('assigns a course to classes in the same programme with none set', () => {
    const plan = planBulkCourseAssignment([klass(), klass({ id: 'c2' })], SCRATCH);
    expect(plan.assign.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(plan.refused).toHaveLength(0);
  });

  it('refuses a class from a different programme, so it cannot be taught the wrong course', () => {
    const plan = planBulkCourseAssignment([klass({ program_id: TEEN })], SCRATCH);
    expect(plan.assign).toHaveLength(0);
    expect(plan.refused[0].reason).toMatch(/different programme/i);
  });

  it('refuses a class with no programme rather than guessing', () => {
    const plan = planBulkCourseAssignment([klass({ program_id: null })], SCRATCH);
    expect(plan.refused[0].reason).toMatch(/no programme/i);
  });

  it('refuses when the course itself has no programme', () => {
    const plan = planBulkCourseAssignment([klass()], { id: 'x', program_id: null });
    expect(plan.refused[0].reason).toMatch(/not attached to a programme/i);
  });

  it('does not silently change a class that already teaches something else', () => {
    const plan = planBulkCourseAssignment([klass({ current_course_id: 'course-other' })], SCRATCH);
    expect(plan.assign).toHaveLength(0);
    expect(plan.refused[0].reason).toMatch(/already teaches/i);
  });

  it('changes it when replacement is explicitly asked for', () => {
    const plan = planBulkCourseAssignment(
      [klass({ current_course_id: 'course-other' })],
      SCRATCH,
      { replaceExisting: true },
    );
    expect(plan.assign.map((c) => c.id)).toEqual(['c1']);
  });

  it('separates classes already on this course instead of rewriting them', () => {
    const plan = planBulkCourseAssignment([klass({ current_course_id: SCRATCH.id })], SCRATCH);
    expect(plan.assign).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.refused).toHaveLength(0);
  });

  it('sorts a mixed batch into assign, unchanged and refused', () => {
    const plan = planBulkCourseAssignment(
      [
        klass({ id: 'ok' }),
        klass({ id: 'already', current_course_id: SCRATCH.id }),
        klass({ id: 'wrong-prog', program_id: TEEN }),
        klass({ id: 'has-other', current_course_id: 'course-other' }),
      ],
      SCRATCH,
    );
    expect(plan.assign.map((c) => c.id)).toEqual(['ok']);
    expect(plan.unchanged.map((c) => c.id)).toEqual(['already']);
    expect(plan.refused.map((c) => c.id).sort()).toEqual(['has-other', 'wrong-prog']);
  });
});
