import type { SupabaseClient } from '@supabase/supabase-js';
import { inCurriculumRange, percentage } from '../calculations';
import { recordSource, type DataSourceStatus } from '../source-query';
import type { SchoolReportCurriculumLoadResult, SchoolReportRange } from './types';

type AnyClient = SupabaseClient<any>;

function curriculumWeeks(content: any, range: SchoolReportRange) {
  const terms = Array.isArray(content?.terms) ? content.terms : [];
  return terms.flatMap((term: any) => {
    const termNumber = Number(term.term ?? term.term_number ?? 0);
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
  }> = [],
): Promise<SchoolReportCurriculumLoadResult> {
  const [{ data: curricula, error: curriculaError }, { data: tracking, error: trackingError }] = await Promise.all([
    admin
      .from('course_curricula')
      .select('id,school_id,content,courses(title,programs(name))')
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .limit(1000),
    admin
      .from('curriculum_week_tracking')
      .select('curriculum_id,term_number,week_number,status')
      .eq('school_id', schoolId)
      .limit(10000),
  ]);

  const dataSources: DataSourceStatus[] = [
    recordSource('curricula', { error: curriculaError, rows: (curricula ?? []) as any[], cap: 1000, checkedAt }),
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

  const mappedCurriculumCourses = ((curricula ?? []) as any[])
    .map((curriculum) => {
      const planned = curriculumWeeks(curriculum.content, range).length;
      const rows = trackingRows.filter((row) => row.curriculum_id === curriculum.id);
      const completed = rows.filter((row) => row.status === 'completed').length;
      const inProgress = rows.filter((row) => row.status === 'in_progress').length;
      const skipped = rows.filter((row) => row.status === 'skipped').length;
      return {
        course: curriculum.courses?.title || 'Course',
        programme: curriculum.courses?.programs?.name || 'Programme',
        planned,
        completed,
        inProgress,
        skipped,
        coverage: percentage(completed, planned),
      };
    })
    .filter((row) => row.planned > 0 || row.completed > 0 || row.inProgress > 0);

  const curriculumCourseKeys = new Set(
    mappedCurriculumCourses.map((c) => `${c.programme.toLowerCase()}::${c.course.toLowerCase()}`),
  );
  for (const pc of programmeCoursePerformance) {
    const key = `${pc.programme.toLowerCase()}::${pc.course.toLowerCase()}`;
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
      });
    }
  }

  const plannedWeeks = mappedCurriculumCourses.reduce((sum, row) => sum + row.planned, 0);
  const completedWeeks = mappedCurriculumCourses.reduce((sum, row) => sum + row.completed, 0);
  const inProgressWeeks = mappedCurriculumCourses.reduce((sum, row) => sum + row.inProgress, 0);
  const skippedWeeks = mappedCurriculumCourses.reduce((sum, row) => sum + row.skipped, 0);

  return {
    data: {
      plannedWeeks,
      completedWeeks,
      inProgressWeeks,
      skippedWeeks,
      courses: mappedCurriculumCourses,
    },
    dataSources,
  };
}
