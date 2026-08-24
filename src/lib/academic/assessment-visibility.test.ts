import { describe, expect, it } from 'vitest';
import { assessmentVisibleToStudent } from './assessment-visibility';

const student = {
  id: 'student-1',
  school_id: 'school-1',
  school_name: 'School One',
  class_id: 'class-1',
  section_class: 'JSS 1',
};
const scope = {
  programIds: new Set(['program-1']),
  courseIds: new Set(['course-1']),
};

describe('shared assessment learner visibility', () => {
  it('requires the exact class for class-scoped CBT and written papers', () => {
    expect(assessmentVisibleToStudent({
      school_id: 'school-1', class_id: 'class-1', course_id: 'course-1', metadata: {},
    }, student, scope)).toBe(true);
    expect(assessmentVisibleToStudent({
      school_id: 'school-1', class_id: 'class-2', course_id: 'course-1', metadata: {},
    }, student, scope)).toBe(false);
  });

  it('enforces school and programme boundaries for practice assessments', () => {
    expect(assessmentVisibleToStudent({
      school_id: 'school-1', program_id: 'program-1', metadata: { assessment_scope: 'practice' },
    }, student, scope)).toBe(true);
    expect(assessmentVisibleToStudent({
      school_id: 'school-2', program_id: 'program-1', metadata: { assessment_scope: 'practice' },
    }, student, scope)).toBe(false);
    expect(assessmentVisibleToStudent({
      school_id: 'school-1', program_id: 'program-2', metadata: { assessment_scope: 'practice' },
    }, student, scope)).toBe(false);
  });

  it('hides unscoped assessments unless they are deliberately platform-wide', () => {
    expect(assessmentVisibleToStudent({ school_id: null, metadata: {} }, student, scope)).toBe(false);
    expect(assessmentVisibleToStudent({ school_id: null, metadata: { visibility: 'all' } }, {
      ...student, school_id: null,
    }, scope)).toBe(true);
  });
});
