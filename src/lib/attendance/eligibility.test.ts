import { describe, expect, it } from 'vitest';
import { canRecordAttendanceForStudent } from './eligibility';

describe('canRecordAttendanceForStudent', () => {
  it('accepts an active current-term roster even while profile repair is pending', () => {
    expect(canRecordAttendanceForStudent({
      sessionClassId: 'class-a', studentClassId: 'class-b', hasRosterRecord: true, rosterStatus: 'active',
    })).toBe(true);
  });

  it('uses profile class membership for legacy learners without a roster row', () => {
    expect(canRecordAttendanceForStudent({
      sessionClassId: 'class-a', studentClassId: 'class-a', hasRosterRecord: false,
    })).toBe(true);
  });

  it('rejects a withdrawn roster even when the profile still points to the class', () => {
    expect(canRecordAttendanceForStudent({
      sessionClassId: 'class-a', studentClassId: 'class-a', hasRosterRecord: true, rosterStatus: 'withdrawn',
    })).toBe(false);
  });

  it('rejects unrelated students and sessions without a class', () => {
    expect(canRecordAttendanceForStudent({
      sessionClassId: 'class-a', studentClassId: 'class-b', hasRosterRecord: false,
    })).toBe(false);
    expect(canRecordAttendanceForStudent({
      sessionClassId: null, studentClassId: 'class-a', hasRosterRecord: false,
    })).toBe(false);
  });
});
