import { average, percentage } from './calculations';

import {
  resolveProgressReportCourseEvidence,
  type ProgressReportCourseContext,
  type ScopeCourseRow,
} from '@/lib/courses/class-course-resolution';

/**
 * Published learner progress report row (student_progress_reports).
 *
 * DB field naming note:
 * - overall_score       → exam / overall term score
 * - participation_score → attendance %
 * - attendance_score    → assignments % (legacy misname)
 *
 * course_name/course_id are often stale (default Scratch). Prefer section_class,
 * roster class, and current_module via resolveProgressReportCourseEvidence().
 */
export type StudentProgressReportRow = {
  student_id?: string | null;
  course_id?: string | null;
  course_name?: string | null;
  section_class?: string | null;
  current_module?: string | null;
  overall_score?: number | null;
  participation_score?: number | null;
  attendance_score?: number | null;
  theory_score?: number | null;
  practical_score?: number | null;
  engagement_metrics?: EngagementMetrics | Record<string, unknown> | null;
  is_published?: boolean | null;
  areas_for_growth?: string | null;
  key_strengths?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type ResolvedProgressReportRow = StudentProgressReportRow & {
  resolvedProgramme: string;
  resolvedCourse: string;
  resolvedCourseId: string | null;
};

/** Published row with optional resolved course fields attached at read time. */
export type ProgressReportCourseIdentity = Pick<
  StudentProgressReportRow,
  'student_id' | 'course_id' | 'course_name'
> &
  Partial<Pick<ResolvedProgressReportRow, 'resolvedCourse' | 'resolvedCourseId'>>;

export type EngagementMetrics = {
  classwork_score?: number | null;
  assessment_score?: number | null;
};

export type MappedProgressReportScores = {
  exam: number | null;
  attendance: number | null;
  assignments: number | null;
  classwork: number | null;
  assessment: number | null;
  theory: number | null;
  practical: number | null;
};

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function averageNullable(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function parseEngagementMetrics(
  row: Pick<StudentProgressReportRow, 'engagement_metrics'>,
): { classwork: number | null; assessment: number | null } {
  const metrics = row?.engagement_metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return { classwork: null, assessment: null };
  }
  const classwork = Number((metrics as EngagementMetrics).classwork_score);
  const assessment = Number((metrics as EngagementMetrics).assessment_score);
  return {
    classwork: Number.isFinite(classwork) ? classwork : null,
    assessment: Number.isFinite(assessment) ? assessment : null,
  };
}

/** Canonical mapping from DB columns to report semantics. */
export function mapProgressReportScores(row: StudentProgressReportRow): MappedProgressReportScores {
  const engagement = parseEngagementMetrics(row);
  const exam = Number(row.overall_score);
  const attendance = Number(row.participation_score);
  const assignments = Number(row.attendance_score);
  const theory = Number(row.theory_score);
  const practical = Number(row.practical_score);
  return {
    exam: Number.isFinite(exam) ? clampScore(exam) : null,
    attendance: Number.isFinite(attendance) ? clampScore(attendance) : null,
    assignments: Number.isFinite(assignments) ? clampScore(assignments) : null,
    classwork: engagement.classwork,
    assessment: engagement.assessment,
    theory: Number.isFinite(theory) ? clampScore(theory) : null,
    practical: Number.isFinite(practical) ? clampScore(practical) : null,
  };
}

export function progressReportCourseLabel(
  row: Pick<ProgressReportCourseIdentity, 'course_name' | 'resolvedCourse'>,
): string {
  return String(row.resolvedCourse || row.course_name || 'Course').trim();
}

export function progressReportResolvedCourseKey(
  row: Pick<ProgressReportCourseIdentity, 'course_id' | 'course_name' | 'resolvedCourse' | 'resolvedCourseId'>,
): string {
  return String(row.resolvedCourseId || row.resolvedCourse || row.course_id || row.course_name || 'course');
}

export function progressReportDedupeKey(
  row: ProgressReportCourseIdentity,
): string | null {
  if (!row.student_id) return null;
  return `${row.student_id}::${progressReportResolvedCourseKey(row)}`;
}

export function attachResolvedProgressReportCourses<T extends StudentProgressReportRow>(
  rows: T[],
  scope: ScopeCourseRow[],
  studentClassById: Map<string, string>,
  courseMetaById: Map<string, { course: string; programme: string }>,
): Array<T & { resolvedProgramme: string; resolvedCourse: string; resolvedCourseId: string | null }> {
  return rows.map((row) => {
    const context: ProgressReportCourseContext = {
      rosterClassName: row.student_id ? studentClassById.get(String(row.student_id)) : null,
    };
    const resolved = resolveProgressReportCourseEvidence(row, scope, context, courseMetaById);
    return {
      ...row,
      resolvedProgramme: resolved.programme,
      resolvedCourse: resolved.course,
      resolvedCourseId: resolved.courseId,
    };
  });
}

export function filterPublishedProgressReports<T extends StudentProgressReportRow>(rows: T[]): T[] {
  return rows.filter((row) => Boolean(row.is_published));
}

export function extractExamScores(rows: StudentProgressReportRow[]): number[] {
  return rows
    .map((row) => mapProgressReportScores(row).exam)
    .filter((value): value is number => value != null);
}

export function extractAttendanceScores(rows: StudentProgressReportRow[]): number[] {
  return extractResultEntryAttendanceScores(rows);
}

/** True when score entry never had real attendance evidence (default 0 placeholder). */
export function progressReportAttendanceEvidenceMissing(row: StudentProgressReportRow): boolean {
  const metrics = row.engagement_metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return false;
  return (metrics as Record<string, unknown>).attendance_evidence_missing === true;
}

/**
 * participation_score values usable as attendance backfill from Report Builder.
 * Skips default 0 rows flagged as missing evidence so empty drafts do not count.
 */
export function extractResultEntryAttendanceScores(rows: StudentProgressReportRow[]): number[] {
  return rows.flatMap((row) => {
    const mapped = mapProgressReportScores(row);
    if (mapped.attendance == null) return [];
    if (mapped.attendance === 0 && progressReportAttendanceEvidenceMissing(row)) return [];
    return [mapped.attendance];
  });
}

export type AttendanceEvidenceSource = 'manual_roll' | 'result_entry' | 'none';

export type AttendanceEvidence = {
  rate: number | null;
  source: AttendanceEvidenceSource;
  /** Number of roll marks or published score rows backing this rate. */
  recordCount: number;
};

/** Resolve attendance rows to portal_users.id (handles legacy students.id on attendance.student_id). */
export function resolveAttendancePortalUserId(
  row: { user_id?: string | null; student_id?: string | null },
  portalUserIds: Set<string>,
  legacyStudentIdToPortalUserId: Map<string, string>,
): string | null {
  const userId = row.user_id ? String(row.user_id) : '';
  if (userId && portalUserIds.has(userId)) return userId;

  const studentId = row.student_id ? String(row.student_id) : '';
  if (studentId) {
    if (portalUserIds.has(studentId)) return studentId;
    const mapped = legacyStudentIdToPortalUserId.get(studentId);
    if (mapped && portalUserIds.has(mapped)) return mapped;
  }

  return userId && portalUserIds.has(userId) ? userId : null;
}

/** Index class attendance roll statuses by portal_users.id. */
export function indexAttendanceByPortalUser(
  rows: Array<{ user_id?: string | null; student_id?: string | null; status?: string | null }>,
  portalUserIds: Set<string>,
  legacyStudentIdToPortalUserId: Map<string, string>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const portalUserId = resolveAttendancePortalUserId(row, portalUserIds, legacyStudentIdToPortalUserId);
    if (!portalUserId) continue;
    const list = map.get(portalUserId) ?? [];
    list.push(String(row.status || ''));
    map.set(portalUserId, list);
  }
  return map;
}

function attendanceRateFromRoll(statuses: string[]): number {
  const present = statuses.filter((status) => ['present', 'late'].includes(status)).length;
  return percentage(present, statuses.length);
}

/**
 * Linked learner attendance — single source of truth for school reports and gradebooks.
 *
 * Priority (session roll overrides score entry):
 * 1. Professional sessional roll when enough session marks exist (≥ minRollRecords)
 * 2. Report Builder participation_score on published progress reports (backfill)
 * 3. Sparse sessional roll when no score-entry backfill exists
 */
export function resolveLinkedLearnerAttendance(
  publishedReports: StudentProgressReportRow[],
  attendanceStatuses: string[],
  options?: { minRollRecords?: number },
): AttendanceEvidence {
  const minRoll = Math.max(1, options?.minRollRecords ?? 3);

  if (attendanceStatuses.length >= minRoll) {
    return {
      rate: attendanceRateFromRoll(attendanceStatuses),
      source: 'manual_roll',
      recordCount: attendanceStatuses.length,
    };
  }

  const resultEntryScores = extractResultEntryAttendanceScores(publishedReports);
  if (resultEntryScores.length) {
    return {
      rate: average(resultEntryScores),
      source: 'result_entry',
      recordCount: resultEntryScores.length,
    };
  }

  if (attendanceStatuses.length > 0) {
    return {
      rate: attendanceRateFromRoll(attendanceStatuses),
      source: 'manual_roll',
      recordCount: attendanceStatuses.length,
    };
  }

  return { rate: null, source: 'none', recordCount: 0 };
}

/** @deprecated Use resolveLinkedLearnerAttendance with published report rows. */
export function resolveReportAttendance(
  publishedReportsOrScores: StudentProgressReportRow[] | number[],
  attendanceStatuses: string[],
  options?: { minRollRecords?: number },
): AttendanceEvidence {
  if (
    publishedReportsOrScores.length > 0
    && typeof publishedReportsOrScores[0] === 'number'
  ) {
    const legacyScores = publishedReportsOrScores as number[];
    const syntheticRows = legacyScores.map((participation_score) => ({ participation_score }));
    return resolveLinkedLearnerAttendance(syntheticRows, attendanceStatuses, options);
  }
  return resolveLinkedLearnerAttendance(
    publishedReportsOrScores as StudentProgressReportRow[],
    attendanceStatuses,
    options,
  );
}

/** Include learners with attendance evidence and/or a term score in the school report roster. */
export function learnerIncludedInSchoolReport(
  row: Pick<{ attendanceRate: number | null; averageScore: number | null }, 'attendanceRate' | 'averageScore'>,
): boolean {
  return row.attendanceRate != null || row.averageScore != null;
}
