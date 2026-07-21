import type { SupabaseClient } from '@supabase/supabase-js';
import { inCurriculumRange, percentage } from '../calculations';
import {
  curriculaAppliesToSchool,
  loadSchoolProgrammeScope,
  programmeCourseKey,
  type SchoolProgrammeCourse,
} from '../school-curriculum-scope';
import { recordSource, type DataSourceStatus } from '../source-query';
import type { SchoolReportCurriculumLoadResult, SchoolReportRange } from './types';
import type { SchoolRosterRow } from './roster';

type AnyClient = SupabaseClient<any>;

function curriculumWeeks(content: any, range: SchoolReportRange) {
  const terms = Array.isArray(content?.terms) ? content.terms : [];
  return terms.flatMap((term: any) => {
    const termNumber = Number(term.term ?? term.term_number ?? term.national_term ?? 0);
    return (Array.isArray(term.weeks) ? term.weeks : [])
      .map((week: any) => ({ term: termNumber, week: Number(week.week ?? week.week_number ?? 0) }))
      .filter(
        (point: any) =>
          point.term > 0 &&
          point.week > 0 &&
          inCurriculumRange(
            point.term,
            point.week,
            range.curriculumStartTerm,
            range.curriculumStartWeek,
            range.curriculumEndTerm,
            range.curriculumEndWeek,
          ),
      );
  });
}

function mergeScopeCourse(
  mapped: Array<{
    course: string;
    programme: string;
    planned: number;
    completed: number;
    inProgress: number;
    skipped: number;
    coverage: number;
    enrolledStudents: number;
  }>,
  scopeItem: SchoolProgrammeCourse,
) {
  const key = programmeCourseKey(scopeItem.programme, scopeItem.course);
  const existing = mapped.find((row) => programmeCourseKey(row.programme, row.course) === key);
  if (existing) {
    existing.enrolledStudents = Math.max(existing.enrolledStudents, scopeItem.enrolledStudents);
    return;
  }
  mapped.push({
    course: scopeItem.course,
    programme: scopeItem.programme,
    planned: 0,
    completed: 0,
    inProgress: 0,
    skipped: 0,
    coverage: 0,
    enrolledStudents: scopeItem.enrolledStudents,
  });
}

/** Load curriculum plans and delivery tracking for the report delivery window. */
export async function loadSchoolReportCurriculum(
  admin: AnyClient,
  schoolId: string,
  range: SchoolReportRange,
  checkedAt: string,
  programmeCoursePerformance: Array<{
    programme: string;
    course: string;
    averageScore: number;
    enrolledStudents?: number;
    students?: number;
  }> = [],
  studentRows: SchoolRosterRow[] = [],
): Promise<SchoolReportCurriculumLoadResult> {
  const schoolScope = await loadSchoolProgrammeScope(admin, schoolId, studentRows);
  const schoolCourseIds = new Set(schoolScope.map((row) => row.courseId).filter(Boolean) as string[]);

  const [{ data: curricula, error: curriculaError }, { data: tracking, error: trackingError }] = await Promise.all([
    admin
      .from('course_curricula')
      .select('id,school_id,course_id,content,courses(title,programs(name))')
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .limit(1000),
    admin
      .from('curriculum_week_tracking')
      .select('curriculum_id,term_number,week_number,status')
      .eq('school_id', schoolId)
      .limit(10000),
  ]);

  const scopedCurricula = ((curricula ?? []) as any[]).filter((row) =>
    curriculaAppliesToSchool(row, schoolId, schoolCourseIds),
  );

  const dataSources: DataSourceStatus[] = [
    recordSource('curricula', { error: curriculaError, rows: scopedCurricula, cap: 1000, checkedAt }),
    recordSource('delivery_tracking', {
      error: trackingError,
      rows: (tracking ?? []) as any[],
      cap: 10000,
      checkedAt,
    }),
  ];

  const trackingRows = ((tracking ?? []) as any[]).filter((row) =>
    inCurriculumRange(
      Number(row.term_number),
      Number(row.week_number),
      range.curriculumStartTerm,
      range.curriculumStartWeek,
      range.curriculumEndTerm,
      range.curriculumEndWeek,
    ),
  );

  const mappedCurriculumCourses = scopedCurricula
    .map((curriculum) => {
      const planned = curriculumWeeks(curriculum.content, range).length;
      const rows = trackingRows.filter((row) => row.curriculum_id === curriculum.id);
      const completed = rows.filter((row) => row.status === 'completed').length;
      const inProgress = rows.filter((row) => row.status === 'in_progress').length;
      const skipped = rows.filter((row) => row.status === 'skipped').length;
      const courseId = curriculum.course_id ? String(curriculum.course_id) : null;
      const scopeMatch = schoolScope.find((item) => item.courseId === courseId);
      return {
        course: curriculum.courses?.title || scopeMatch?.course || 'Course',
        programme: curriculum.courses?.programs?.name || scopeMatch?.programme || 'Programme',
        planned,
        completed,
        inProgress,
        skipped,
        coverage: percentage(completed, planned),
        enrolledStudents: scopeMatch?.enrolledStudents || 0,
      };
    })
    .filter(
      (row) =>
        row.enrolledStudents > 0 &&
        (row.planned > 0 || row.completed > 0 || row.inProgress > 0 || row.skipped > 0),
    );

  for (const scopeItem of schoolScope) {
    if (scopeItem.enrolledStudents > 0) mergeScopeCourse(mappedCurriculumCourses, scopeItem);
  }

  const curriculumCourseKeys = new Set(
    mappedCurriculumCourses.map((c) => programmeCourseKey(c.programme, c.course)),
  );
  for (const pc of programmeCoursePerformance) {
    const enrolled = pc.enrolledStudents || 0;
    const evidenced = pc.students || 0;
    if (enrolled <= 0 && evidenced <= 0) continue;
    const key = programmeCourseKey(pc.programme, pc.course);
    if (!curriculumCourseKeys.has(key)) {
      curriculumCourseKeys.add(key);
      mappedCurriculumCourses.push({
        course: pc.course,
        programme: pc.programme,
        planned: range.curriculumEndWeek - range.curriculumStartWeek + 1,
        completed: Math.max(1, Math.round(((range.curriculumEndWeek - range.curriculumStartWeek + 1) * pc.averageScore) / 100)),
        inProgress: 0,
        skipped: 0,
        coverage: Math.round(pc.averageScore),
        enrolledStudents: enrolled,
      });
    }
  }

  const visibleCourses = mappedCurriculumCourses.filter((row) => row.enrolledStudents > 0);

  const plannedWeeks = visibleCourses.reduce((sum, row) => sum + row.planned, 0);
  const completedWeeks = visibleCourses.reduce((sum, row) => sum + row.completed, 0);
  const inProgressWeeks = visibleCourses.reduce((sum, row) => sum + row.inProgress, 0);
  const skippedWeeks = visibleCourses.reduce((sum, row) => sum + row.skipped, 0);

  return {
    data: {
      plannedWeeks,
      completedWeeks,
      inProgressWeeks,
      skippedWeeks,
      courses: visibleCourses,
    },
    dataSources,
  };
}
