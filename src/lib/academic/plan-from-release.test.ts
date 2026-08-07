import { describe, expect, it } from 'vitest';
import { buildPlanRow, planDataForTerm, termNumberFrom } from './plan-from-release';

const week = (n: number) => ({ week: n, type: 'lesson', notes: `week ${n}` });

const release = {
  terms: [
    { term: 1, title: 'AI Foundations', weeks: [week(1), week(2)] },
    { term: 2, title: 'Python Basics', weeks: [week(1), week(2), week(3)] },
    { term: 3, title: 'Projects', weeks: [] },
  ],
};

describe('reading the term out of a label', () => {
  it('recognises how terms are actually written', () => {
    expect(termNumberFrom('First Term')).toBe(1);
    expect(termNumberFrom('Second Term')).toBe(2);
    expect(termNumberFrom('Third Term')).toBe(3);
    expect(termNumberFrom('Term 2')).toBe(2);
  });

  it('returns null rather than guessing', () => {
    expect(termNumberFrom('Summer Intensive')).toBeNull();
    expect(termNumberFrom(null)).toBeNull();
    expect(termNumberFrom('')).toBeNull();
  });
});

describe('choosing the weeks a class should teach', () => {
  it('takes the matching term', () => {
    const plan = planDataForTerm(release, 'Second Term');
    expect(plan?.weeks).toHaveLength(3);
    expect(plan?.source_term).toBe(2);
    expect(plan?.source_title).toBe('Python Basics');
  });

  it('falls back to a term that has weeks rather than refusing', () => {
    // No plan at all is a dead end — the class cannot generate anything. A plan
    // from another term is a starting point a teacher can adjust.
    const plan = planDataForTerm(release, 'Summer Intensive');
    expect(plan?.weeks).toHaveLength(2);
    expect(plan?.source_term).toBe(1);
  });

  it('skips a term that is empty', () => {
    // Term 3 exists but carries no weeks; a plan built from it would be a plan
    // with nothing in it, which generates exactly as much as no plan.
    expect(planDataForTerm(release, 'Third Term')?.source_term).toBe(1);
  });

  it('reads a release that never grouped by term', () => {
    const flat = { weeks: [week(1), week(2), week(3), week(4)] };
    expect(planDataForTerm(flat, 'First Term')?.weeks).toHaveLength(4);
  });

  it('returns null when there is genuinely nothing to teach', () => {
    expect(planDataForTerm({ terms: [] }, 'First Term')).toBeNull();
    expect(planDataForTerm({ terms: [{ term: 1, weeks: [] }] }, 'First Term')).toBeNull();
    expect(planDataForTerm(null, 'First Term')).toBeNull();
    expect(planDataForTerm({} as never, 'First Term')).toBeNull();
  });
});

describe('the row that gets written', () => {
  const good = {
    classId: 'class-1',
    schoolId: 'school-1',
    courseId: 'course-1',
    termId: 'term-1',
    releaseId: 'release-1',
    planData: { weeks: [week(1)] },
  };

  it('matches the shape of the plans that already generate', () => {
    const row = buildPlanRow(good)!;
    expect(row.status).toBe('published');
    expect(row.version).toBe(2);
    expect(row.sessions_per_week).toBe(1);
    expect(row.curriculum_release_id).toBe('release-1');
  });

  it('is published, not draft', () => {
    // The generate routes reject a draft with "publish it and the whole week
    // will generate". Building a draft would swap one blocking message for
    // another, from a curriculum that was already published.
    expect(buildPlanRow(good)!.status).toBe('published');
  });

  it('refuses to write a row that could never generate', () => {
    // The routes require both a course and a school. A row missing either looks
    // ready in the list and still fails at the point of use.
    expect(buildPlanRow({ ...good, courseId: null })).toBeNull();
    expect(buildPlanRow({ ...good, schoolId: null })).toBeNull();
    expect(buildPlanRow({ ...good, classId: '' })).toBeNull();
    expect(buildPlanRow({ ...good, planData: { weeks: [] } })).toBeNull();
  });

  it('allows a missing term without blocking the plan', () => {
    // Special programmes deliberately carry no school term.
    expect(buildPlanRow({ ...good, termId: null })?.term_id).toBeNull();
  });

  it('honours a real sessions-per-week and ignores nonsense', () => {
    expect(buildPlanRow({ ...good, sessionsPerWeek: 2 })!.sessions_per_week).toBe(2);
    expect(buildPlanRow({ ...good, sessionsPerWeek: 0 })!.sessions_per_week).toBe(1);
  });
});

describe('fine-tuning: mergePlanWithRelease and customisePlanWeek', () => {
  it('marks a week as customized and preserves original topic', async () => {
    const { customisePlanWeek } = await import('./plan-from-release');
    const initialPlan = { weeks: [{ week: 1, topic: 'Standard Intro' }, { week: 2, topic: 'Standard Variables' }] };

    const customized = customisePlanWeek(initialPlan, 1, { topic: 'Custom Intro with Robots' });
    expect(customized.weeks[0].topic).toBe('Custom Intro with Robots');
    expect(customized.weeks[0].is_customized).toBe(true);
    expect(customized.weeks[0].original_topic).toBe('Standard Intro');
    expect(customized.weeks[1].is_customized).toBeUndefined();
  });

  it('preserves teacher customized weeks when merging with an updated release', async () => {
    const { customisePlanWeek, mergePlanWithRelease } = await import('./plan-from-release');
    const initialPlan = { weeks: [{ week: 1, topic: 'Old Week 1' }, { week: 2, topic: 'Old Week 2' }] };
    const customizedPlan = customisePlanWeek(initialPlan, 1, { topic: 'Teacher Fine-Tuned Week 1' });

    const newReleaseContent = {
      terms: [
        {
          term: 1,
          weeks: [
            { week: 1, topic: 'Updated Release Week 1' },
            { week: 2, topic: 'Updated Release Week 2' },
            { week: 3, topic: 'Brand New Release Week 3' },
          ],
        },
      ],
    };

    const merged = mergePlanWithRelease({
      existingPlanData: customizedPlan,
      releaseContent: newReleaseContent,
      termLabel: 'First Term',
    });

    expect(merged?.weeks).toHaveLength(3);
    // Week 1 was customized by teacher -> preserved!
    expect(merged?.weeks[0].topic).toBe('Teacher Fine-Tuned Week 1');
    expect(merged?.weeks[0].is_customized).toBe(true);
    // Week 2 was NOT customized -> updated to new release version!
    expect(merged?.weeks[1].topic).toBe('Updated Release Week 2');
    // Week 3 is brand new from release -> added!
    expect(merged?.weeks[2].topic).toBe('Brand New Release Week 3');
  });
});



