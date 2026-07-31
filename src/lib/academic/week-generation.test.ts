import { describe, expect, it } from 'vitest';
import { canGenerateForClass, currentTermWeek, normaliseTypes } from './week-generation';

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

  it('is week 1 for a start date that will not parse', () => {
    expect(currentTermWeek('not-a-date')).toBe(1);
  });
});

describe('normaliseTypes', () => {
  it('defaults to all three content types', () => {
    expect(normaliseTypes(undefined)).toEqual(['lessons', 'assignments', 'projects']);
  });

  it('drops anything not a real content type', () => {
    expect(normaliseTypes(['lessons', 'sql-injection', 'projects'])).toEqual(['lessons', 'projects']);
  });

  it('falls back to all three rather than generating nothing', () => {
    expect(normaliseTypes(['nonsense'])).toEqual(['lessons', 'assignments', 'projects']);
    expect(normaliseTypes([])).toEqual(['lessons', 'assignments', 'projects']);
  });
});
