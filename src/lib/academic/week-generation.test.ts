import { describe, expect, it } from 'vitest';
import { canGenerateForClass, currentTermWeek, normaliseTypes, weekReadyNotificationTitle, weekReadyReviewPath } from './week-generation';

describe('canGenerateForClass', () => {
  const owner = { id: 'teacher-1', role: 'teacher' };
  const other = { id: 'teacher-2', role: 'teacher' };

  it('lets a teacher generate for the class they own', () => {
    expect(canGenerateForClass(owner, { teacher_id: 'teacher-1' })).toBe(true);
  });

  it("refuses a teacher on a colleague's class, even in the same school", () => {
    expect(canGenerateForClass(other, { teacher_id: 'teacher-1' })).toBe(false);
  });

  it('refuses a teacher when the class has no owner', () => {
    expect(canGenerateForClass(owner, { teacher_id: null })).toBe(false);
    expect(canGenerateForClass(owner, null)).toBe(false);
  });

  it('allows admins anywhere', () => {
    expect(canGenerateForClass({ id: 'a', role: 'admin' }, { teacher_id: 'teacher-1' })).toBe(true);
    expect(canGenerateForClass({ id: 'a', role: 'admin' }, null)).toBe(true);
  });

  it('refuses school and student roles outright', () => {
    expect(canGenerateForClass({ id: 's', role: 'school' }, { teacher_id: 's' })).toBe(false);
    expect(canGenerateForClass({ id: 'p', role: 'student' }, { teacher_id: 'p' })).toBe(false);
    expect(canGenerateForClass({ id: 'n', role: null }, { teacher_id: 'n' })).toBe(false);
  });
});

describe('currentTermWeek', () => {
  it('is week 1 with no start date', () => {
    expect(currentTermWeek(null)).toBe(1);
  });

  it('is week 1 before the term starts, never zero or negative', () => {
    const nextMonth = new Date(Date.now() + 30 * 864e5).toISOString();
    expect(currentTermWeek(nextMonth)).toBe(1);
  });

  it('counts elapsed weeks from the start date', () => {
    const twoWeeksIn = new Date(Date.now() - 9 * 864e5).toISOString();
    expect(currentTermWeek(twoWeeksIn)).toBe(2);
  });

  it('starts week 2 on the seventh calendar day without a millisecond race', () => {
    expect(currentTermWeek('2026-08-03T23:59:59.999Z', new Date('2026-08-10T00:00:00.001Z'))).toBe(2);
  });

  it('is week 1 for a start date that will not parse', () => {
    expect(currentTermWeek('not-a-date')).toBe(1);
  });
});

describe('normaliseTypes', () => {
  it('defaults to every content type', () => {
    expect(normaliseTypes(undefined)).toEqual(['lessons', 'slides', 'flashcards', 'assignments', 'projects']);
  });

  it('drops anything not a real content type', () => {
    expect(normaliseTypes(['lessons', 'sql-injection', 'projects']))
      .toEqual(['lessons', 'slides', 'flashcards', 'projects']);
  });

  it('falls back to everything rather than generating nothing', () => {
    expect(normaliseTypes(['nonsense'])).toEqual(['lessons', 'slides', 'flashcards', 'assignments', 'projects']);
    expect(normaliseTypes([])).toEqual(['lessons', 'slides', 'flashcards', 'assignments', 'projects']);
  });

  it('adds slides wherever lessons are asked for', () => {
    // Every plan's stored settings predate slides existing in the pipeline, so
    // without this those plans would keep producing lessons with no slides.
    expect(normaliseTypes(['lessons', 'assignments', 'projects']))
      .toEqual(['lessons', 'slides', 'flashcards', 'assignments', 'projects']);
  });

  it('runs slides after the lesson they are rendered from', () => {
    // Order is dependency order, not the order the caller happened to store.
    expect(normaliseTypes(['projects', 'slides', 'lessons']))
      .toEqual(['lessons', 'slides', 'flashcards', 'projects']);
  });

  it('does not invent lessons for a caller that only wants assignments', () => {
    expect(normaliseTypes(['assignments'])).toEqual(['assignments']);
  });
});

describe('week ready delivery', () => {
  it('opens review on the exact meeting, with Session 2 named in the title', () => {
    expect(
      weekReadyReviewPath({
        planId: 'plan-1',
        week: 3,
        session: 2,
      }),
    ).toBe('/dashboard/teaching/approvals?week=3&session=2&plan=plan-1');
    expect(
      weekReadyNotificationTitle({
        week: 3,
        session: 2,
        className: 'JSS 1A',
      }),
    ).toBe('JSS 1A · Week 3 · Session 2 is ready to review');
  });
});
