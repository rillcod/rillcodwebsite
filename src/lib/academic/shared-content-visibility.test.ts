import { describe, expect, it } from 'vitest';
import {
  canLearnerSeeSharedWeek,
  lockScopeForSharedWeek,
  resolveWeekForLearner,
  visibleWeeksForLearner,
} from './shared-content-visibility';

const RELEASE_A = 'release-ai-foundations';
const RELEASE_B = 'release-python-basics';

const week = (n: number, release = RELEASE_A) => ({
  curriculum_release_id: release,
  curriculum_week_number: n,
});

const learner = (over: Partial<Parameters<typeof canLearnerSeeSharedWeek>[1]> = {}) => ({
  classId: 'class-1',
  adoptedReleaseId: RELEASE_A,
  weeksReleasedToLearners: 3,
  ...over,
});

describe('a learner never sees another school\'s curriculum', () => {
  it('refuses a week from a release the class did not adopt', () => {
    // The whole risk of sharing one copy across 26 classes: this must be false.
    expect(canLearnerSeeSharedWeek(week(1, RELEASE_B), learner())).toBe(false);
  });

  it('allows a week from the release the class did adopt', () => {
    expect(canLearnerSeeSharedWeek(week(1, RELEASE_A), learner())).toBe(true);
  });

  it('shows nothing to a learner with no class', () => {
    expect(canLearnerSeeSharedWeek(week(1), learner({ classId: null }))).toBe(false);
  });

  it('shows nothing when the class has adopted nothing', () => {
    // A class not yet set up. Showing another school's material is worse than
    // showing an empty week, so the absence of an adoption denies rather than
    // falls back to the master.
    expect(canLearnerSeeSharedWeek(week(1), learner({ adoptedReleaseId: null }))).toBe(false);
  });

  it('denies rather than throws on nonsense', () => {
    expect(canLearnerSeeSharedWeek(null, learner())).toBe(false);
    expect(canLearnerSeeSharedWeek(week(1), null)).toBe(false);
    expect(canLearnerSeeSharedWeek(week(0), learner())).toBe(false);
    expect(canLearnerSeeSharedWeek(week(NaN as never), learner())).toBe(false);
  });
});

describe('a class only sees as far as it has been taught', () => {
  it('shows weeks up to and including the released week', () => {
    expect(canLearnerSeeSharedWeek(week(3), learner({ weeksReleasedToLearners: 3 }))).toBe(true);
  });

  it('hides a week the class has not reached', () => {
    // Another school on the same curriculum may already be on week 8. That must
    // not pull week 8 forward for a class sitting on week 3.
    expect(canLearnerSeeSharedWeek(week(8), learner({ weeksReleasedToLearners: 3 }))).toBe(false);
  });

  it('shows nothing before teaching starts', () => {
    expect(canLearnerSeeSharedWeek(week(1), learner({ weeksReleasedToLearners: 0 }))).toBe(false);
  });

  it('filters a batch rather than trusting the caller to', () => {
    const batch = [week(1), week(2), week(3), week(4), week(9), week(1, RELEASE_B)];
    const visible = visibleWeeksForLearner(batch, learner({ weeksReleasedToLearners: 3 }));
    expect(visible.map((w) => w.curriculum_week_number)).toEqual([1, 2, 3]);
  });
});

describe('a class that rewrote a week sees its own version', () => {
  it('serves the class override when one exists', () => {
    const out = resolveWeekForLearner({
      content: week(2),
      learner: learner(),
      classOverrides: [{ curriculum_week_number: 2, content_id: 'our-own-week-2' }],
    });
    expect(out).toEqual({ source: 'class', contentId: 'our-own-week-2' });
  });

  it('serves the shared week when the class has not rewritten it', () => {
    const out = resolveWeekForLearner({
      content: week(2),
      learner: learner(),
      classOverrides: [{ curriculum_week_number: 3, content_id: 'our-own-week-3' }],
    });
    expect(out).toEqual({ source: 'shared' });
  });

  it('returns null when the learner may not see the week at all', () => {
    // Not "fall back to shared" — a caller treating a missing override as
    // permission to serve the master is exactly how another school's week
    // reaches a learner.
    const out = resolveWeekForLearner({
      content: week(1, RELEASE_B),
      learner: learner(),
      classOverrides: [],
    });
    expect(out).toBeNull();
  });

  it('never serves an override belonging to a week the learner cannot see', () => {
    const out = resolveWeekForLearner({
      content: week(9),
      learner: learner({ weeksReleasedToLearners: 3 }),
      classOverrides: [{ curriculum_week_number: 9, content_id: 'week-9' }],
    });
    expect(out).toBeNull();
  });
});

describe('locking stays with the class', () => {
  it('is class-scoped, never shared', () => {
    // Per-class content made this true by construction. Sharing widens a lock to
    // every class on the curriculum unless it is held class-side: one school
    // publishing week 3 would otherwise stop 25 others receiving a better one.
    expect(lockScopeForSharedWeek()).toBe('class');
  });
});
