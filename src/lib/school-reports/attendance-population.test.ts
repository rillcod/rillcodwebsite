import { describe, expect, it } from 'vitest';
import {
  extractResultEntryAttendanceScores,
  indexAttendanceByPortalUser,
  learnerIncludedInSchoolReport,
  resolveAttendancePortalUserId,
  resolveLinkedLearnerAttendance,
  resolveReportAttendance,
} from './progress-report';

describe('linked learner attendance', () => {
  it('session roll overrides score-entry participation_score when enough marks exist', () => {
    const reports = [{ participation_score: 82 }, { participation_score: 88 }];
    expect(resolveLinkedLearnerAttendance(reports, ['absent', 'absent', 'present', 'late'])).toEqual({
      rate: 50,
      source: 'manual_roll',
      recordCount: 4,
    });
  });

  it('backfills from participation_score when session roll is sparse', () => {
    const reports = [{ participation_score: 82 }, { participation_score: 88 }];
    expect(resolveLinkedLearnerAttendance(reports, ['absent', 'absent'])).toEqual({
      rate: 85,
      source: 'result_entry',
      recordCount: 2,
    });
  });

  it('uses full session roll when score entry is missing', () => {
    expect(resolveLinkedLearnerAttendance([], ['present', 'late', 'absent'])).toEqual({
      rate: 66.7,
      source: 'manual_roll',
      recordCount: 3,
    });
  });

  it('credits late attendance and removes excused sessions from the denominator', () => {
    expect(resolveLinkedLearnerAttendance([], ['present', 'late', 'absent', 'excused'])).toEqual({
      rate: 66.7,
      source: 'manual_roll',
      recordCount: 4,
    });
  });

  it('does not describe an entirely excused roll as zero attendance', () => {
    expect(resolveLinkedLearnerAttendance([], ['excused', 'excused'])).toEqual({
      rate: null,
      source: 'manual_roll',
      recordCount: 2,
    });
  });

  it('uses sparse session roll when no score-entry backfill exists', () => {
    expect(resolveLinkedLearnerAttendance([], ['present', 'absent'], { minRollRecords: 3 })).toEqual({
      rate: 50,
      source: 'manual_roll',
      recordCount: 2,
    });
  });

  it('prefers score entry over sparse roll when both exist', () => {
    expect(resolveLinkedLearnerAttendance([{ participation_score: 90 }], ['absent'], { minRollRecords: 3 })).toEqual({
      rate: 90,
      source: 'result_entry',
      recordCount: 1,
    });
  });

  it('skips default 0 participation_score flagged as missing evidence', () => {
    const rows = [
      { participation_score: 0, engagement_metrics: { attendance_evidence_missing: true } },
      { participation_score: 85 },
    ];
    expect(extractResultEntryAttendanceScores(rows)).toEqual([85]);
    expect(resolveLinkedLearnerAttendance(rows, [])).toEqual({
      rate: 85,
      source: 'result_entry',
      recordCount: 1,
    });
  });

  it('treats result-entry scores as attendance coverage even with no class roll', () => {
    expect(extractResultEntryAttendanceScores([{ participation_score: 90 }, { participation_score: 80 }])).toHaveLength(2);
  });

  it('does not invent attendance evidence', () => {
    expect(resolveLinkedLearnerAttendance([], [])).toEqual({ rate: null, source: 'none', recordCount: 0 });
  });

  it('includes learners with attendance, scores, or both in the report roster', () => {
    expect(learnerIncludedInSchoolReport({ attendanceRate: 88, averageScore: null })).toBe(true);
    expect(learnerIncludedInSchoolReport({ attendanceRate: null, averageScore: 72 })).toBe(true);
    expect(learnerIncludedInSchoolReport({ attendanceRate: 88, averageScore: 72 })).toBe(true);
    expect(learnerIncludedInSchoolReport({ attendanceRate: null, averageScore: null })).toBe(false);
  });

  it('legacy numeric resolveReportAttendance API still works', () => {
    expect(resolveReportAttendance([82, 88], ['present', 'late', 'absent', 'absent'])).toEqual({
      rate: 50,
      source: 'manual_roll',
      recordCount: 4,
    });
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
