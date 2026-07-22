import { describe, expect, it } from 'vitest';
import { resolveReportAttendance } from './aggregate';

describe('report attendance evidence', () => {
  it('prefers published attendance scores over raw roll rows', () => {
    expect(resolveReportAttendance([82, 88], ['absent', 'absent'])).toEqual({ rate: 85, source: 'result_entry' });
  });
  it('uses term rolls only when no published score exists', () => {
    expect(resolveReportAttendance([], ['present', 'late', 'absent'])).toEqual({ rate: 66.7, source: 'manual_roll' });
  });
  it('does not invent attendance evidence', () => {
    expect(resolveReportAttendance([], [])).toEqual({ rate: null, source: 'none' });
  });
});
