import { describe, expect, it } from 'vitest';
import {
  extractAttendanceScores,
  extractExamScores,
  mapProgressReportScores,
  progressReportDedupeKey,
  resolveReportAttendance,
} from './progress-report';

describe('progress-report', () => {
  it('maps legacy DB column names to report semantics', () => {
    expect(
      mapProgressReportScores({
        overall_score: 76,
        participation_score: 91,
        attendance_score: 88,
        theory_score: 72,
        practical_score: 80,
        engagement_metrics: { classwork_score: 84, assessment_score: 79 },
      }),
    ).toEqual({
      exam: 76,
      attendance: 91,
      assignments: 88,
      classwork: 84,
      assessment: 79,
      theory: 72,
      practical: 80,
    });
  });

  it('extracts exam and attendance pools for published learners', () => {
    const rows = [
      { overall_score: 70, participation_score: 80, is_published: true },
      { overall_score: 80, participation_score: 90, is_published: true },
    ];
    expect(extractExamScores(rows)).toEqual([70, 80]);
    expect(extractAttendanceScores(rows)).toEqual([80, 90]);
  });

  it('dedupes by student and resolved course identity', () => {
    expect(progressReportDedupeKey({ student_id: 's1', course_id: 'c1' })).toBe('s1::c1');
    expect(progressReportDedupeKey({
      student_id: 's1',
      course_id: 'scratch-id',
      course_name: 'Creative Coding with Scratch',
      resolvedCourse: 'Python for Beginners',
      resolvedCourseId: 'python-id',
    })).toBe('s1::python-id');
  });

  it('prefers roll marks when enough records exist, otherwise published participation_score', () => {
    expect(resolveReportAttendance([82, 88], ['present', 'late', 'absent', 'absent'])).toEqual({
      rate: 50,
      source: 'manual_roll',
      recordCount: 4,
    });
    expect(resolveReportAttendance([82, 88], ['absent'])).toEqual({
      rate: 85,
      source: 'result_entry',
      recordCount: 2,
    });
    expect(resolveReportAttendance([], ['present', 'late', 'absent'])).toEqual({
      rate: 66.7,
      source: 'manual_roll',
      recordCount: 3,
    });
  });
});
