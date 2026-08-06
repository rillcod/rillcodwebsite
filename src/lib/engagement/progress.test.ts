import { describe, expect, it } from 'vitest';
import {
  DISCUSSION_DAILY_CAP,
  LEVELS,
  POINTS,
  levelFor,
  nextStep,
  nextStreak,
  pointsForActivity,
  progressFor,
} from './progress';

describe('what we pay for', () => {
  it('no longer pays anyone for showing up', () => {
    // daily_login sat at 10 points and was never awarded by any code path.
    // Paying for attendance rewards opening the app, not learning.
    expect(POINTS).not.toHaveProperty('daily_login');
  });

  it('pays most for the thing that proves the most', () => {
    expect(POINTS.quiz_pass).toBeGreaterThan(POINTS.assignment_submit);
    expect(POINTS.assignment_submit).toBeGreaterThan(POINTS.lesson_complete);
    expect(POINTS.lesson_complete).toBeGreaterThan(POINTS.discussion_post);
  });

  it('stops paying for discussion posts past the daily cap', () => {
    // Each post carries its own reference id, so idempotency does not stop a
    // hundred one-word replies being farmed for points.
    expect(pointsForActivity('discussion_post', { alreadyToday: 0 })).toBe(POINTS.discussion_post);
    expect(pointsForActivity('discussion_post', { alreadyToday: DISCUSSION_DAILY_CAP - 1 })).toBe(POINTS.discussion_post);
    expect(pointsForActivity('discussion_post', { alreadyToday: DISCUSSION_DAILY_CAP })).toBe(0);
    expect(pointsForActivity('discussion_post', { alreadyToday: 99 })).toBe(0);
  });

  it('never caps real work', () => {
    for (const activity of ['lesson_complete', 'assignment_submit', 'quiz_pass'] as const) {
      expect(pointsForActivity(activity, { alreadyToday: 50 })).toBe(POINTS[activity]);
    }
  });
});

describe('the ladder is reachable', () => {
  it('puts the first level-up inside a first week of real work', () => {
    // It used to be 500 points — fifty lessons — so every learner was Bronze
    // forever, and the live table proved it: one row, Bronze.
    const silver = LEVELS.find((l) => l.name === 'Silver')!;
    expect(silver.at).toBeLessThanOrEqual(POINTS.quiz_pass * 2);
  });

  it('rises and never repeats a threshold', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].at).toBeGreaterThan(LEVELS[i - 1].at);
    }
    expect(LEVELS[0].at).toBe(0);
  });

  it('places a learner on the right rung', () => {
    expect(levelFor(0)).toBe('Bronze');
    expect(levelFor(99)).toBe('Bronze');
    expect(levelFor(100)).toBe('Silver');
    expect(levelFor(399)).toBe('Silver');
    expect(levelFor(400)).toBe('Gold');
    expect(levelFor(1200)).toBe('Platinum');
    expect(levelFor(999999)).toBe('Platinum');
  });

  it('treats nonsense as zero rather than throwing at a learner', () => {
    expect(levelFor(-50)).toBe('Bronze');
    expect(levelFor(NaN)).toBe('Bronze');
  });
});

describe('progress tells you where you stand', () => {
  it('reports the gap to the next rung', () => {
    const p = progressFor(60);
    expect(p.level).toBe('Bronze');
    expect(p.nextLevel).toBe('Silver');
    expect(p.pointsToNextLevel).toBe(40);
    expect(p.percentToNextLevel).toBe(60);
  });

  it('closes out cleanly at the top', () => {
    const p = progressFor(5000);
    expect(p.level).toBe('Platinum');
    expect(p.nextLevel).toBeNull();
    expect(p.pointsToNextLevel).toBe(0);
    expect(p.percentToNextLevel).toBe(100);
  });

  it('keeps the bar inside 0-100 at a boundary', () => {
    expect(progressFor(100).percentToNextLevel).toBe(0);
    expect(progressFor(0).percentToNextLevel).toBe(0);
  });
});

describe('next step is an instruction, not a number', () => {
  it('names one quiz when one quiz would do it', () => {
    expect(nextStep(60)).toBe('Pass one quiz to reach Silver.');
  });

  it('names lessons when the gap is small', () => {
    expect(nextStep(80)).toMatch(/Finish 2 more lessons to reach Silver\./);
  });

  it('offers both routes when the gap is wide', () => {
    const step = nextStep(150);
    expect(step).toContain('quizzes');
    expect(step).toContain('lessons');
    expect(step).toContain('Gold');
  });

  it('says something sensible at the top instead of a dead end', () => {
    expect(nextStep(9999)).toMatch(/top level/i);
  });
});

describe('streaks count days of work, not actions', () => {
  it('starts at one', () => {
    expect(nextStreak(0, null, '2026-08-06')).toBe(1);
  });

  it('does not move for a second activity the same day', () => {
    // Five things on Monday is one day of work, not five.
    expect(nextStreak(4, '2026-08-06', '2026-08-06')).toBe(4);
  });

  it('increments across consecutive days', () => {
    expect(nextStreak(4, '2026-08-05', '2026-08-06')).toBe(5);
  });

  it('resets after a gap', () => {
    expect(nextStreak(9, '2026-08-01', '2026-08-06')).toBe(1);
  });

  it('handles a month boundary', () => {
    expect(nextStreak(3, '2026-07-31', '2026-08-01')).toBe(4);
  });
});
