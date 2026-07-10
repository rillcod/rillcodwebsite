import { describe, expect, it } from 'vitest';
import { isTeacherClassVisible } from './teacher-class-scope';

describe('teacher class isolation', () => {
  const assigned = ['hilltop'];

  it('shows an unowned assigned-school class to Sulemani', () => {
    expect(isTeacherClassVisible({ teacher_id: null, school_id: 'hilltop' }, 'sulemani', assigned)).toBe(true);
  });

  it('shows the teacher-owned class and blocks another teacher owner', () => {
    expect(isTeacherClassVisible({ teacher_id: 'sulemani', school_id: 'hilltop' }, 'sulemani', assigned)).toBe(true);
    expect(isTeacherClassVisible({ teacher_id: 'other', school_id: 'hilltop' }, 'sulemani', assigned)).toBe(false);
  });

  it('never crosses the assigned-school boundary', () => {
    expect(isTeacherClassVisible({ teacher_id: null, school_id: 'elsewhere' }, 'sulemani', assigned)).toBe(false);
  });

  it('shows all assigned-school classes when isolation is off', () => {
    expect(isTeacherClassVisible({ teacher_id: 'other', school_id: 'hilltop' }, 'sulemani', assigned, true)).toBe(true);
  });
});
