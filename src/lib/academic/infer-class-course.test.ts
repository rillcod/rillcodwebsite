import { describe, expect, it } from 'vitest';
import { describeInference, inferClassCourse } from './infer-class-course';

describe('inferClassCourse', () => {
  it('leaves a class that already has a course alone', () => {
    const out = inferClassCourse({
      currentCourseId: 'chosen',
      programmeCourses: ['a', 'b'],
      adoptedCourseIds: ['a'],
    });
    expect(out).toEqual({ courseId: 'chosen', reason: 'already_set' });
  });

  it('takes the only course when a programme offers one', () => {
    const out = inferClassCourse({ currentCourseId: null, programmeCourses: ['solo'], adoptedCourseIds: [] });
    expect(out.courseId).toBe('solo');
    expect(out.reason).toBe('only_course_in_programme');
  });

  // The case that stranded 37 classes: several courses, but only one with a live edition.
  it('picks the single course the school has actually adopted', () => {
    const out = inferClassCourse({
      currentCourseId: null,
      programmeCourses: ['scratch', 'python', 'robotics'],
      adoptedCourseIds: ['scratch'],
    });
    expect(out.courseId).toBe('scratch');
    expect(out.reason).toBe('only_adopted_course');
  });

  it('ignores adoptions for courses outside this programme', () => {
    const out = inferClassCourse({
      currentCourseId: null,
      programmeCourses: ['scratch', 'python'],
      adoptedCourseIds: ['teen-dev-course', 'scratch'],
    });
    expect(out.courseId).toBe('scratch');
  });

  it('will not choose between two live editions', () => {
    const out = inferClassCourse({
      currentCourseId: null,
      programmeCourses: ['scratch', 'python'],
      adoptedCourseIds: ['scratch', 'python'],
    });
    expect(out.courseId).toBeNull();
    expect(out.reason).toBe('ambiguous');
    expect((out as any).candidates.sort()).toEqual(['python', 'scratch']);
  });

  it('stays undecided when several courses exist and none is adopted', () => {
    const out = inferClassCourse({
      currentCourseId: null,
      programmeCourses: ['scratch', 'python'],
      adoptedCourseIds: [],
    });
    expect(out.courseId).toBeNull();
    expect(out.reason).toBe('ambiguous');
  });

  it('reports no programme courses distinctly from an ambiguous choice', () => {
    const out = inferClassCourse({ currentCourseId: null, programmeCourses: [], adoptedCourseIds: [] });
    expect(out.reason).toBe('no_programme_courses');
  });

  it('de-duplicates a repeated course rather than reading it as ambiguity', () => {
    const out = inferClassCourse({
      currentCourseId: null,
      programmeCourses: ['solo', 'solo'],
      adoptedCourseIds: [],
    });
    expect(out.courseId).toBe('solo');
  });
});

describe('describeInference', () => {
  it('says nothing when a course was decided', () => {
    expect(describeInference({ courseId: 'x', reason: 'already_set' }, 1)).toBe('');
  });

  it('distinguishes "nothing published yet" from "more than one published"', () => {
    const ambiguous = { courseId: null, reason: 'ambiguous' as const, candidates: ['a', 'b'] };
    expect(describeInference(ambiguous, 0)).toMatch(/none has a published edition/i);
    expect(describeInference(ambiguous, 2)).toMatch(/2 published editions/i);
  });
});
