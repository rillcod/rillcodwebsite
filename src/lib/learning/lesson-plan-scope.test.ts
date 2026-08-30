import { describe, expect, it } from 'vitest';
import { rowMatchesTeachingPeriod } from '@/lib/academic/teaching-period';
import {
  attachLearnerPackageAvailability,
  compareLessonsByClassWeek,
  learningAssetMatchesLesson,
  lessonsOnWeek,
  nextLessonInClassOrder,
  releasedWeekCap,
  selectClassPlansForScope,
  sortLessonsByClassWeek,
  thisWeekNumber,
  visibleLessonsOnClassPlans,
} from './lesson-plan-scope';

const CLASS = 'class-1';
const RELEASE_A = 'release-scratch';
const RELEASE_B = 'release-python';

const plan = (over: Record<string, unknown> = {}) => ({
  id: 'plan-1',
  class_id: CLASS,
  course_id: 'course-1',
  term_id: 'term-1',
  curriculum_release_id: RELEASE_A,
  status: 'published',
  ...over,
});

const lesson = (over: Record<string, unknown> & { id: string; title: string }) => ({
  status: 'active',
  course_id: 'course-1',
  lesson_plan_id: 'plan-1',
  curriculum_release_id: RELEASE_A,
  session_number: 1,
  ...over,
});

describe('class plan period matching', () => {
  it('matches a school-term plan by term_id', () => {
    expect(
      rowMatchesTeachingPeriod(
        { term_id: 'term-1', offering_period_id: null },
        { term_id: 'term-1', offering_period_id: null },
      ),
    ).toBe(true);
    expect(
      rowMatchesTeachingPeriod(
        { term_id: 'term-2', offering_period_id: null },
        { term_id: 'term-1', offering_period_id: null },
      ),
    ).toBe(false);
  });

  it('matches a duration-programme plan by offering period', () => {
    expect(
      rowMatchesTeachingPeriod(
        { term_id: null, offering_period_id: 'period-1' },
        { term_id: null, offering_period_id: 'period-1' },
      ),
    ).toBe(true);
  });
});

describe('learner lesson order', () => {
  it('orders by curriculum week, then class meeting, not by id', () => {
    const rows = [
      lesson({ id: 'z-late', title: 'Week 8', curriculum_week_number: 8 }),
      lesson({ id: 'a-early', title: 'Week 1', curriculum_week_number: 1 }),
      lesson({
        id: 'b-week3-class2',
        title: 'Week 3 class 2',
        curriculum_week_number: 3,
        session_number: 2,
      }),
      lesson({
        id: 'c-week3-class1',
        title: 'Week 3 class 1',
        curriculum_week_number: 3,
        session_number: 1,
      }),
    ];
    expect(sortLessonsByClassWeek(rows).map((row) => row.id)).toEqual([
      'a-early',
      'c-week3-class1',
      'b-week3-class2',
      'z-late',
    ]);
  });

  it('picks the first unfinished lesson in that week order', () => {
    const rows = [
      lesson({ id: 'week-2', title: 'Two', curriculum_week_number: 2 }),
      lesson({ id: 'week-1', title: 'One', curriculum_week_number: 1 }),
      lesson({ id: 'week-3', title: 'Three', curriculum_week_number: 3 }),
    ];
    expect(nextLessonInClassOrder(rows, new Set(['week-1']))?.id).toBe('week-2');
  });

  it('does not use UUID order as a fallback for next up', () => {
    const a = lesson({ id: 'aaa', title: 'Later week', curriculum_week_number: 4 });
    const b = lesson({ id: 'zzz', title: 'First week', curriculum_week_number: 1 });
    expect(compareLessonsByClassWeek(a, b)).toBeGreaterThan(0);
    expect(nextLessonInClassOrder([a, b], new Set())?.id).toBe('zzz');
  });
});

describe('learner class package', () => {
  it('uses lesson id first, then exact plan, week and class meeting', () => {
    const target = lesson({
      id: 'lesson-1',
      title: 'One',
      curriculum_week_number: 3,
      session_number: 2,
    });
    expect(learningAssetMatchesLesson({ lesson_id: 'lesson-1' }, target)).toBe(true);
    expect(
      learningAssetMatchesLesson(
        {
          lesson_plan_id: 'plan-1',
          curriculum_week_number: 3,
          session_number: 2,
        },
        target,
      ),
    ).toBe(true);
    expect(
      learningAssetMatchesLesson(
        {
          lesson_plan_id: 'plan-1',
          curriculum_week_number: 3,
          session_number: 1,
        },
        target,
      ),
    ).toBe(false);
    expect(
      learningAssetMatchesLesson(
        {
          lesson_id: 'another-lesson',
          lesson_plan_id: 'plan-1',
          curriculum_week_number: 3,
          session_number: 2,
        },
        target,
      ),
    ).toBe(false);
  });

  it('reports only items that are linked to the exact lesson session', () => {
    const rows = [
      lesson({ id: 'lesson-1', title: 'One', curriculum_week_number: 1 }),
      lesson({ id: 'lesson-2', title: 'Two', curriculum_week_number: 2 }),
    ];
    const attached = attachLearnerPackageAvailability(rows, {
      slides: [
        { lesson_id: 'lesson-1' },
        {
          lesson_plan_id: 'plan-1',
          curriculum_week_number: 2,
          session_number: 1,
        },
      ],
      flashcards: [{ lesson_id: 'lesson-1' }],
      assignments: [
        { lesson_id: 'lesson-1', assignment_type: 'homework' },
        { lesson_id: 'lesson-1', assignment_type: 'project' },
      ],
    });

    expect(attached[0].learner_package).toEqual({
      lesson: true,
      slides: true,
      practice: true,
      assignment: true,
      project: true,
      availableCount: 5,
    });
    expect(attached[1].learner_package).toMatchObject({
      lesson: true,
      slides: true,
      practice: false,
      assignment: false,
      project: false,
      availableCount: 2,
    });
  });

  it('keeps legacy week-generator work under assignment, matching the teacher view', () => {
    const [attached] = attachLearnerPackageAvailability(
      [lesson({ id: 'lesson-1', title: 'One', curriculum_week_number: 1 })],
      {
        assignments: [
          {
            lesson_id: 'lesson-1',
            assignment_type: 'project',
            metadata: { source: 'week-ai-generator' },
          },
        ],
      },
    );
    expect(attached.learner_package).toMatchObject({
      assignment: true,
      project: false,
    });
  });
});

describe('shared release gate on the class plan', () => {
  it('hides a live lesson stamped with a release this class did not adopt', () => {
    const rows = [
      lesson({
        id: 'ours',
        title: 'Week 1',
        curriculum_week_number: 1,
        curriculum_release_id: RELEASE_A,
      }),
      lesson({
        id: 'theirs',
        title: 'Other school week 1',
        curriculum_week_number: 1,
        curriculum_release_id: RELEASE_B,
      }),
    ];
    expect(visibleLessonsOnClassPlans(rows, [plan()], CLASS).map((row) => row.id)).toEqual([
      'ours',
    ]);
  });

  it('hides draft lessons even when they sit on the class plan', () => {
    const rows = [
      lesson({
        id: 'held',
        title: 'Not shared',
        curriculum_week_number: 2,
        status: 'draft',
      }),
    ];
    expect(visibleLessonsOnClassPlans(rows, [plan()], CLASS)).toEqual([]);
  });

  it('drops catalogue leftovers when the class has a plan', () => {
    const rows = [
      lesson({ id: 'on-plan', title: 'Shared', curriculum_week_number: 1 }),
      {
        id: 'catalogue',
        title: 'Old course dump',
        status: 'active',
        course_id: 'course-1',
        lesson_plan_id: null,
        curriculum_week_number: 1,
      },
    ];
    expect(visibleLessonsOnClassPlans(rows, [plan()], CLASS).map((row) => row.id)).toEqual([
      'on-plan',
    ]);
  });

  it('shows nothing when the learner has no class', () => {
    const rows = [lesson({ id: 'w1', title: 'One', curriculum_week_number: 1 })];
    expect(visibleLessonsOnClassPlans(rows, [plan()], '')).toEqual([]);
  });

  it('hides a live future week when the class calendar has not reached it', () => {
    const rows = [
      lesson({ id: 'now', title: 'Week 3', curriculum_week_number: 3 }),
      lesson({ id: 'ahead', title: 'Week 8', curriculum_week_number: 8 }),
    ];
    expect(
      visibleLessonsOnClassPlans(rows, [plan()], CLASS, { currentWeek: 3 }).map(
        (row) => row.id,
      ),
    ).toEqual(['now']);
  });

  it('drops a plan lesson with no week number — that is catalogue leftover', () => {
    const rows = [
      lesson({ id: 'on-week', title: 'Shared', curriculum_week_number: 1 }),
      lesson({ id: 'no-week', title: 'Loose', curriculum_week_number: undefined }),
    ];
    expect(visibleLessonsOnClassPlans(rows, [plan()], CLASS).map((row) => row.id)).toEqual([
      'on-week',
    ]);
  });
});

describe('this class week', () => {
  it('caps released weeks at the class calendar', () => {
    expect(releasedWeekCap(8, 3)).toBe(3);
    expect(releasedWeekCap(2, 5)).toBe(2);
  });

  it('picks the latest live week at or before today, not the next module in the catalogue', () => {
    const rows = [
      lesson({ id: 'w1', title: 'One', curriculum_week_number: 1 }),
      lesson({ id: 'w3', title: 'Three', curriculum_week_number: 3 }),
      lesson({ id: 'w8', title: 'Eight', curriculum_week_number: 8 }),
    ];
    const visible = visibleLessonsOnClassPlans(rows, [plan()], CLASS, {
      currentWeek: 3,
    });
    expect(thisWeekNumber(visible, 3)).toBe(3);
    expect(lessonsOnWeek(visible, 3).map((row) => row.id)).toEqual(['w3']);
    expect(nextLessonInClassOrder(lessonsOnWeek(visible, 3), new Set())?.id).toBe(
      'w3',
    );
  });
});

describe('which plans count', () => {
  it('keeps this class, this term, and drops archived plans', () => {
    const selected = selectClassPlansForScope(
      [
        plan(),
        plan({ id: 'other-class', class_id: 'class-2' }),
        plan({ id: 'other-term', term_id: 'term-2' }),
        plan({ id: 'old', status: 'archived' }),
      ],
      { classId: CLASS, termId: 'term-1' },
    );
    expect(selected.map((row) => row.id)).toEqual(['plan-1']);
  });

  it('keeps a duration-programme plan by offering period', () => {
    const selected = selectClassPlansForScope(
      [
        plan({ id: 'bootcamp', term_id: null, offering_period_id: 'period-1' }),
        plan({ id: 'school-term', term_id: 'term-1', offering_period_id: null }),
      ],
      { classId: CLASS, offeringPeriodId: 'period-1' },
    );
    expect(selected.map((row) => row.id)).toEqual(['bootcamp']);
  });

  it('keeps the class current course when one is set', () => {
    const selected = selectClassPlansForScope(
      [plan(), plan({ id: 'other-course', course_id: 'course-9' })],
      { classId: CLASS, termId: 'term-1', currentCourseId: 'course-1' },
    );
    expect(selected.map((row) => row.id)).toEqual(['plan-1']);
  });
});
