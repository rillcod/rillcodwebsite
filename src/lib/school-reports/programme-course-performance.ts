import { average } from './calculations';
import {
  clampScore,
  mapProgressReportScores,
  type ResolvedProgressReportRow,
  type StudentProgressReportRow,
} from './progress-report';
import {
  programmeCourseKey,
  resolveProgrammeForCourseEvidence,
  resolveProgressReportCourseEvidence,
  type ProgressReportCourseContext,
  type SchoolProgrammeCourse,
} from './school-curriculum-scope';
import { submissionPercent } from './gradebook-detail';

export type ProgrammeCoursePerformanceRow = {
  programme: string;
  course: string;
  submissions: number;
  averageScore: number;
  students: number;
  enrolledStudents: number;
};

type CourseGroupAccumulator = {
  programme: string;
  course: string;
  termScores: number[];
  gradebookScores: number[];
  students: Set<string>;
};

function resolveCourseProgramme(
  scope: Pick<SchoolProgrammeCourse, 'programme' | 'course'>[],
  courseName: string,
  programmeHint?: string | null,
): string {
  return resolveProgrammeForCourseEvidence(scope, courseName, programmeHint);
}

function resolvePublishedReportCourse(
  row: StudentProgressReportRow | ResolvedProgressReportRow,
  scope: SchoolProgrammeCourse[],
  courseMetaById: Map<string, { course: string; programme: string }>,
  context?: ProgressReportCourseContext,
): { programme: string; course: string } {
  if ('resolvedCourse' in row && row.resolvedCourse) {
    return {
      programme: String(row.resolvedProgramme || 'Programme'),
      course: String(row.resolvedCourse),
    };
  }
  const resolved = resolveProgressReportCourseEvidence(row, scope, context, courseMetaById);
  return { programme: resolved.programme, course: resolved.course };
}

function getOrCreateGroup(
  groups: Map<string, CourseGroupAccumulator>,
  programme: string,
  course: string,
): CourseGroupAccumulator {
  const key = programmeCourseKey(programme, course);
  const existing = groups.get(key);
  if (existing) return existing;
  const group = { programme, course, termScores: [], gradebookScores: [], students: new Set<string>() };
  groups.set(key, group);
  return group;
}

/**
 * Build per-programme/course performance from published term assessments and gradebook fallback.
 * Term assessment scores (overall_score) are never averaged with assignment submission percents.
 */
export function buildProgrammeCoursePerformance(input: {
  scope: SchoolProgrammeCourse[];
  publishedReports: Array<StudentProgressReportRow | ResolvedProgressReportRow>;
  submissions: any[];
  courseMetaById: Map<string, { course: string; programme: string }>;
  enrollmentByKey: Map<string, number>;
  studentClassById?: Map<string, string>;
}): ProgrammeCoursePerformanceRow[] {
  const groups = new Map<string, CourseGroupAccumulator>();
  const scope = input.scope;

  for (const row of input.submissions) {
    const score = submissionPercent(row);
    const studentId = row.portal_user_id || row.user_id;
    if (score == null || !studentId) continue;
    const courseRelation = Array.isArray(row.assignments?.courses)
      ? row.assignments.courses[0]
      : row.assignments?.courses;
    const programmeRelation = Array.isArray(courseRelation?.programs)
      ? courseRelation.programs[0]
      : courseRelation?.programs;
    const course = String(courseRelation?.title || 'Unassigned course');
    const programme = resolveCourseProgramme(scope, course, programmeRelation?.name);
    const group = getOrCreateGroup(groups, programme, course);
    group.gradebookScores.push(clampScore(score));
    group.students.add(String(studentId));
  }

  for (const row of input.publishedReports) {
    if (!row.student_id) continue;
    const context: ProgressReportCourseContext | undefined = input.studentClassById
      ? { rosterClassName: input.studentClassById.get(String(row.student_id)) }
      : undefined;
    const { programme, course } = resolvePublishedReportCourse(
      row,
      scope,
      input.courseMetaById,
      context,
    );
    const group = getOrCreateGroup(groups, programme, course);
    const exam = mapProgressReportScores(row).exam;
    if (exam != null) group.termScores.push(exam);
    group.students.add(String(row.student_id));
  }

  for (const scopeRow of scope) {
    getOrCreateGroup(groups, scopeRow.programme, scopeRow.course);
  }

  return Array.from(groups.values())
    .map((group) => {
      const termCount = group.termScores.length;
      const gradebookCount = group.gradebookScores.length;
      return {
        programme: group.programme,
        course: group.course,
        submissions: termCount || gradebookCount,
        averageScore: termCount
          ? average(group.termScores)
          : gradebookCount
            ? average(group.gradebookScores)
            : 0,
        students: group.students.size,
        enrolledStudents: input.enrollmentByKey.get(programmeCourseKey(group.programme, group.course)) || 0,
      };
    })
    .filter((row) => row.enrolledStudents > 0 || row.students > 0)
    .sort(
      (a, b) =>
        a.programme.localeCompare(b.programme)
        || b.averageScore - a.averageScore
        || a.course.localeCompare(b.course),
    );
}
