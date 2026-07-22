import { describe, expect, it } from 'vitest';
import { resolveReportAttendance } from './aggregate';

describe('report attendance evidence', () => {
  it('prefers published attendance scores over raw roll rows', () => {
    expect(resolveReportAttendance([82, 88], ['absent', 'absent'])).toEqual({ rate: 85, source: 'result_entry' });
  });
  it('falls back to class roll per learner when published attendance is missing', () => {
    expect(resolveReportAttendance([], ['present', 'late', 'absent'])).toEqual({ rate: 66.7, source: 'manual_roll' });
    expect(resolveReportAttendance([], ['present', 'present'])).toEqual({ rate: 100, source: 'manual_roll' });
  });
  it('does not invent attendance evidence', () => {
    expect(resolveReportAttendance([], [])).toEqual({ rate: null, source: 'none' });
  });
});
