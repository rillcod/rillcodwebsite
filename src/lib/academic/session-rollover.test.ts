import { describe, expect, it } from 'vitest';
import {
  buildRolloverPlan,
  retargetPlanData,
  retitleForSession,
  rosterKey,
  sessionTermLabel,
  shiftDate,
  summariseRolloverPlan,
  type RolloverInput,
  type TermRef,
} from './session-rollover';

const FROM: TermRef = {
  id: 'term-t3-2526',
  academic_year: '2025/2026',
  term_number: 3,
  term_label: 'Third Term',
  start_date: '2026-04-30',
  end_date: '2026-08-05',
};

const TO: TermRef = {
  id: 'term-t1-2627',
  academic_year: '2026/2027',
  term_number: 1,
  term_label: 'First Term',
  start_date: '2026-09-01',
  end_date: '2026-12-20',
};

function input(overrides: Partial<RolloverInput> = {}): RolloverInput {
  return {
    from: FROM,
    to: TO,
    releases: [],
    adoptions: [],
    existingAdoptionKeys: new Set(),
    classes: [],
    rosters: [],
    existingRosterKeys: new Set(),
    lessonPlans: [],
    existingPlanKeys: new Set(),
    publishedReleaseIds: new Set(['rel-live']),
    lessons: [],
    flashcardDecks: [],
    assignments: [],
    ...overrides,
  };
}

describe('session labels and titles', () => {
  it('builds the label lesson_plans.term already stores', () => {
    expect(sessionTermLabel(TO)).toBe('First Term 2026/2027');
  });

  it('rewrites the session inside a release title', () => {
    expect(
      retitleForSession(
        'Creative Coding with Scratch · 2025/2026 Academic Session · All assigned learner levels',
        '2025/2026',
        '2026/2027',
      ),
    ).toBe('Creative Coding with Scratch · 2026/2027 Academic Session · All assigned learner levels');
  });

  it('leaves a title alone when the year does not appear in it', () => {
    expect(retitleForSession('Creative Coding with Scratch', '2025/2026', '2026/2027'))
      .toBe('Creative Coding with Scratch');
  });
});

describe('date shifting', () => {
  it('moves a due date by the gap between the two term starts', () => {
    // Week 1 of Third Term (30 Apr) must arrive as week 1 of First Term (1 Sep).
    expect(shiftDate('2026-05-07T00:00:00.000Z', FROM, TO)?.slice(0, 10)).toBe('2026-09-08');
  });

  it('keeps the week offset intact for a later week', () => {
    expect(shiftDate('2026-05-14T00:00:00.000Z', FROM, TO)?.slice(0, 10)).toBe('2026-09-15');
  });

  it('returns the value untouched when a term has no start date', () => {
    const undated = { ...TO, start_date: null };
    expect(shiftDate('2026-05-07T00:00:00.000Z', FROM, undated)).toBe('2026-05-07T00:00:00.000Z');
  });
});

describe('plan_data retargeting', () => {
  it('rewrites the session a teacher reads at the top of the plan', () => {
    const result = retargetPlanData(
      {
        weeks: [{ week: 1 }],
        academic_direction: {
          title: 'Creative Coding with Scratch · 2025/2026 Academic Session',
          academic_session: '2025/2026',
          current_term: 'Third Term',
          entry_point: 'Teaching begins in First Term, Week 1',
        },
      },
      TO,
      '2025/2026',
    );
    expect((result as any).academic_direction).toEqual({
      title: 'Creative Coding with Scratch · 2026/2027 Academic Session',
      academic_session: '2026/2027',
      current_term: 'First Term',
      entry_point: 'Teaching begins in First Term, Week 1',
    });
    // The weeks themselves are curriculum content and must survive untouched.
    expect((result as any).weeks).toEqual([{ week: 1 }]);
  });

  it('leaves a plan with no direction snapshot alone', () => {
    expect(retargetPlanData({ weeks: [] }, TO, '2025/2026')).toEqual({ weeks: [] });
  });
});

describe('buildRolloverPlan', () => {
  it('refuses to roll a term onto itself', () => {
    const plan = buildRolloverPlan(input({ to: FROM }));
    expect(plan.blocked).toContain('The source and target terms are the same.');
  });

  it('reports the editions that still name the old session, and moves their adoptions', () => {
    const plan = buildRolloverPlan(input({
      releases: [{ id: 'rel-1', title: 'Scratch · 2025/2026 Academic Session', academic_session: '2025/2026', effective_term_number: 1, status: 'published' }],
      adoptions: [
        { id: 'ad-1', school_id: 's1', course_id: 'c1', release_id: 'rel-1', academic_session: '2025/2026', effective_term_number: 1, effective_academic_term_id: 'term-t1-2526' },
        { id: 'ad-2', school_id: 's2', course_id: 'c1', release_id: 'rel-other', academic_session: '2025/2026', effective_term_number: 1, effective_academic_term_id: 'term-t1-2526' },
      ],
    }));
    // Reported, not written: a published edition is immutable by design, so the
    // corrected title is a suggestion for a new edition rather than an update.
    expect(plan.releases_needing_new_edition).toEqual([
      { id: 'rel-1', title: 'Scratch · 2025/2026 Academic Session', suggested_title: 'Scratch · 2026/2027 Academic Session' },
    ]);
    // ad-2 belongs to a release outside this correction and must not be dragged along.
    expect(plan.adoptions).toEqual(['ad-1']);
  });

  it('leaves an adoption alone when the school already has one for the target term', () => {
    const plan = buildRolloverPlan(input({
      releases: [{ id: 'rel-1', title: 'Scratch', academic_session: '2025/2026', effective_term_number: 1, status: 'published' }],
      adoptions: [
        { id: 'ad-1', school_id: 's1', course_id: 'c1', release_id: 'rel-1', academic_session: '2025/2026', effective_term_number: 1, effective_academic_term_id: null },
      ],
      existingAdoptionKeys: new Set(['s1|c1|2026/2027|1']),
    }));
    expect(plan.adoptions).toEqual([]);
    expect(plan.adoption_conflicts).toEqual([
      { id: 'ad-1', reason: 'This school already has an adoption for First Term 2026/2027.' },
    ]);
  });

  it('moves classes on the source term and skips archived ones', () => {
    const plan = buildRolloverPlan(input({
      classes: [
        { id: 'k1', name: 'St. Bryan · Young Innov', term_id: FROM.id, status: 'active', start_date: null },
        { id: 'k2', name: 'Old cohort', term_id: FROM.id, status: 'archived', start_date: null },
        { id: 'k3', name: 'Different term', term_id: 'term-t2-2526', status: 'active', start_date: null },
      ],
    }));
    expect(plan.classes.map((k) => k.id)).toEqual(['k1']);
  });

  it('carries active roster rows forward and leaves withdrawn learners behind', () => {
    // A withdrawal is a decision. Rolling the class forward must not quietly
    // re-enrol someone who was taken off it.
    const plan = buildRolloverPlan(input({
      classes: [{ id: 'k1', name: 'Class', term_id: FROM.id, status: 'active', start_date: null }],
      rosters: [
        { id: 'r1', class_id: 'k1', student_id: 'stu-1', term_id: FROM.id, school_id: 's1', status: 'active' },
        { id: 'r2', class_id: 'k1', student_id: 'stu-2', term_id: FROM.id, school_id: 's1', status: 'withdrawn' },
      ],
    }));
    expect(plan.roster_carry_forward).toEqual([
      { class_id: 'k1', student_id: 'stu-1', school_id: 's1', program_id: null, status: 'active', term_id: TO.id },
    ]);
  });

  it('does not duplicate a roster row that already exists at the target term', () => {
    const plan = buildRolloverPlan(input({
      classes: [{ id: 'k1', name: 'Class', term_id: FROM.id, status: 'active', start_date: null }],
      rosters: [{ id: 'r1', class_id: 'k1', student_id: 'stu-1', term_id: FROM.id, school_id: 's1', status: 'active' }],
      existingRosterKeys: new Set([rosterKey({ class_id: 'k1', student_id: 'stu-1', term_id: TO.id })]),
    }));
    expect(plan.roster_carry_forward).toEqual([]);
  });

  it('re-stamps lesson plans with the target term identity and dates', () => {
    const plan = buildRolloverPlan(input({
      classes: [{ id: 'k1', name: 'Class', term_id: FROM.id, status: 'active', start_date: null }],
      lessonPlans: [{
        id: 'lp-1',
        class_id: 'k1',
        course_id: 'crs-1',
        term: 'Third Term 2025/2026',
        term_id: FROM.id,
        term_start: '2026-04-30',
        term_end: '2026-08-05',
        plan_data: { weeks: [], academic_direction: { academic_session: '2025/2026', current_term: 'Third Term', title: 'X 2025/2026' } },
        status: 'published',
        curriculum_release_id: 'rel-live',
      }],
    }));
    expect(plan.lesson_plans).toEqual([{
      id: 'lp-1',
      term: 'First Term 2026/2027',
      term_id: TO.id,
      term_start: '2026-09-01',
      term_end: '2026-12-20',
      plan_data: { weeks: [], academic_direction: { academic_session: '2026/2027', current_term: 'First Term', title: 'X 2026/2027' } },
    }]);
  });

  it('blocks rather than collides when the class already has a plan at the target term', () => {
    // lesson_plans_active_class_term_course_unique would reject the update
    // partway through the batch, leaving the correction half applied.
    const plan = buildRolloverPlan(input({
      classes: [{ id: 'k1', name: 'Class', term_id: FROM.id, status: 'active', start_date: null }],
      lessonPlans: [{
        id: 'lp-1', class_id: 'k1', course_id: 'crs-1', term: 'Third Term 2025/2026', term_id: FROM.id,
        term_start: null, term_end: null, plan_data: null, status: 'published', curriculum_release_id: 'rel-live',
      }],
      existingPlanKeys: new Set([['k1', 'crs-1', TO.id].join('|')]),
    }));
    expect(plan.lesson_plans).toEqual([]);
    expect(plan.blocked).toHaveLength(1);
  });

  it('takes generated content by its plan link, not by its date', () => {
    // The real data: 4 assignments generated from the moved plans, 3 set by hand
    // mid-term. A created_at heuristic caught only 2 of the 4.
    const plan = buildRolloverPlan(input({
      classes: [{ id: 'k1', name: 'Class', term_id: FROM.id, status: 'active', start_date: null }],
      lessonPlans: [{
        id: 'lp-1', class_id: 'k1', course_id: 'crs-1', term: 'Third Term 2025/2026', term_id: FROM.id,
        term_start: null, term_end: null, plan_data: null, status: 'published', curriculum_release_id: 'rel-live',
      }],
      lessons: [
        { id: 'les-1', lesson_plan_id: 'lp-1' },
        { id: 'les-2', lesson_plan_id: 'lp-other' },
      ],
      flashcardDecks: [
        { id: 'deck-1', lesson_plan_id: 'lp-1' },
        { id: 'deck-2', lesson_plan_id: null },
      ],
      assignments: [
        { id: 'asg-1', lesson_plan_id: 'lp-1', due_date: '2026-05-14T00:00:00.000Z' },
        { id: 'asg-2', lesson_plan_id: null, due_date: '2026-05-09T00:00:00.000Z' },
      ],
    }));
    expect(plan.lessons).toEqual(['les-1']);
    expect(plan.flashcard_decks).toEqual(['deck-1']);
    expect(plan.assignments).toEqual([{ id: 'asg-1', due_date: '2026-09-15T00:00:00.000Z' }]);
  });

  it('leaves an assignment that has been submitted against', () => {
    const plan = buildRolloverPlan(input({
      classes: [{ id: 'k1', name: 'Class', term_id: FROM.id, status: 'active', start_date: null }],
      lessonPlans: [{
        id: 'lp-1', class_id: 'k1', course_id: 'crs-1', term: 'Third Term 2025/2026', term_id: FROM.id,
        term_start: null, term_end: null, plan_data: null, status: 'published', curriculum_release_id: 'rel-live',
      }],
      assignments: [{ id: 'asg-1', lesson_plan_id: 'lp-1', due_date: '2026-05-14T00:00:00.000Z', submission_count: 2 }],
    }));
    expect(plan.assignments).toEqual([]);
  });

  it('reports a plan pinned to a retired edition instead of trying to move it', () => {
    // attach_official_direction_to_lesson_plan re-validates on any term_id
    // change and refuses a withdrawn edition. Learned live: 40 plans moved, 9
    // were rejected mid-batch, and those 9 classes ended up on a different term
    // from their own teaching plans.
    const plan = buildRolloverPlan(input({
      classes: [
        { id: 'k1', name: 'Young Innov', term_id: FROM.id, status: 'active', start_date: null },
        { id: 'k2', name: 'Teen Dev', term_id: FROM.id, status: 'active', start_date: null },
      ],
      lessonPlans: [
        {
          id: 'lp-live', class_id: 'k1', course_id: 'crs-1', term: 'Third Term 2025/2026', term_id: FROM.id,
          term_start: null, term_end: null, plan_data: null, status: 'published', curriculum_release_id: 'rel-live',
        },
        {
          id: 'lp-retired', class_id: 'k2', course_id: 'crs-2', term: 'Third Term 2025/2026', term_id: FROM.id,
          term_start: null, term_end: null, plan_data: null, status: 'draft', curriculum_release_id: 'rel-retired',
        },
      ],
      // Content hanging off the stranded plan must stay with it.
      assignments: [{ id: 'asg-stranded', lesson_plan_id: 'lp-retired', due_date: '2026-05-14T00:00:00.000Z' }],
    }));
    expect(plan.lesson_plans.map((p) => p.id)).toEqual(['lp-live']);
    expect(plan.plans_awaiting_live_edition).toEqual([
      { id: 'lp-retired', class_id: 'k2', release_id: 'rel-retired' },
    ]);
    expect(plan.assignments).toEqual([]);
    // One programme's withdrawn curriculum must not block the whole correction.
    expect(plan.blocked).toEqual([]);
  });

  it('can finish a correction that was only partly applied', () => {
    // The class moved on an earlier run; its plan was rejected and left behind.
    // Re-running must still see that plan, or the two never reconcile.
    const plan = buildRolloverPlan(input({
      classes: [{ id: 'k1', name: 'Already moved', term_id: TO.id, status: 'active', start_date: null }],
      lessonPlans: [{
        id: 'lp-stranded', class_id: 'k1', course_id: 'crs-1', term: 'Third Term 2025/2026', term_id: FROM.id,
        term_start: null, term_end: null, plan_data: null, status: 'draft', curriculum_release_id: 'rel-live',
      }],
    }));
    expect(plan.classes).toEqual([]);
    expect(plan.lesson_plans.map((p) => p.id)).toEqual(['lp-stranded']);
  });

  it('summarises what an operator is about to approve', () => {
    const plan = buildRolloverPlan(input({
      releases: [{ id: 'rel-1', title: 'X', academic_session: '2025/2026', effective_term_number: 1, status: 'published' }],
      classes: [{ id: 'k1', name: 'Class', term_id: FROM.id, status: 'active', start_date: null }],
    }));
    expect(summariseRolloverPlan(plan)).toMatchObject({ releases_needing_new_edition: 1, classes: 1, blocked: 0 });
  });
});
