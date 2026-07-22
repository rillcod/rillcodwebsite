import { describe, expect, it } from 'vitest';
import {
  indexAttendanceByPortalUser,
  resolveAttendancePortalUserId,
  resolveReportAttendance,
} from './progress-report';

describe('report attendance evidence', () => {
  it('prefers class roll marks when enough session records exist', () => {
    expect(resolveReportAttendance([82, 88], ['absent', 'absent', 'present', 'late'])).toEqual({
      rate: 50,
      source: 'manual_roll',
      recordCount: 4,
    });
  });

  it('falls back to published participation_score when roll is sparse', () => {
    expect(resolveReportAttendance([82, 88], ['absent', 'absent'])).toEqual({
      rate: 85,
      source: 'result_entry',
      recordCount: 2,
    });
  });

  it('uses class roll per learner when published attendance is missing', () => {
    expect(resolveReportAttendance([], ['present', 'late', 'absent'])).toEqual({
      rate: 66.7,
      source: 'manual_roll',
      recordCount: 3,
    });
    expect(resolveReportAttendance([], ['present', 'present', 'present'])).toEqual({
      rate: 100,
      source: 'manual_roll',
      recordCount: 3,
    });
  });

  it('ignores sparse class rolls that would distort attendance', () => {
    expect(resolveReportAttendance([], ['absent'], { minRollRecords: 3 })).toEqual({
      rate: null,
      source: 'none',
      recordCount: 0,
    });
    expect(resolveReportAttendance([], ['present', 'absent'], { minRollRecords: 3 })).toEqual({
      rate: null,
      source: 'none',
      recordCount: 0,
    });
  });

  it('does not invent attendance evidence', () => {
    expect(resolveReportAttendance([], [])).toEqual({ rate: null, source: 'none', recordCount: 0 });
  });

  it('links legacy students.id attendance rows to portal_users.id', () => {
    const portalIds = new Set(['portal-1']);
    const legacyMap = new Map([['legacy-student-9', 'portal-1']]);

    expect(
      resolveAttendancePortalUserId({ user_id: null, student_id: 'legacy-student-9' }, portalIds, legacyMap),
    ).toBe('portal-1');

    const indexed = indexAttendanceByPortalUser(
      [
        { user_id: null, student_id: 'legacy-student-9', status: 'present' },
        { user_id: 'portal-1', student_id: null, status: 'late' },
      ],
      portalIds,
      legacyMap,
    );

    expect(indexed.get('portal-1')).toEqual(['present', 'late']);
  });
});
