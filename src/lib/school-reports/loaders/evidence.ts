import type { SupabaseClient } from '@supabase/supabase-js';
import { coverageSessionOrFilter } from '@/lib/reports/academic-period';
import { recordSource, type DataSourceStatus } from '../source-query';
import { attendanceInReportTerm, submissionInReportTerm } from '../term-evidence';
import type { LoaderResult, SchoolReportRange } from './types';
import { fetchAllReportRows } from '../paginated-query';

type AnyClient = SupabaseClient<any>;

const isoStart = (date: string) => `${date}T00:00:00.000Z`;
const isoEnd = (date: string) => `${date}T23:59:59.999Z`;

function dedupeProgressReports(rows: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const row of rows) {
    if (!row?.student_id) continue;
    const key = `${row.student_id}::${row.course_id || row.course_name || 'course'}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const preferRow = (candidate: any, incumbent: any) => {
      if (candidate.is_published && !incumbent.is_published) return true;
      if (candidate.is_published !== incumbent.is_published) return false;
      const candidateAt = new Date(candidate.updated_at || candidate.created_at || 0).getTime();
      const incumbentAt = new Date(incumbent.updated_at || incumbent.created_at || 0).getTime();
      return candidateAt >= incumbentAt;
    };
    if (preferRow(row, existing)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

export type SchoolReportEvidenceLoadResult = LoaderResult<{
  submissions: any[];
  attendance: any[];
  progressReports: any[];
  assignments: any[];
}>;

/** Load gradebook submissions, attendance rolls, progress reports, and assignments for a term window. */
export async function loadSchoolReportEvidence(
  admin: AnyClient,
  schoolId: string,
  range: SchoolReportRange,
  studentIds: string[],
  classIds: string[],
  checkedAt: string,
): Promise<SchoolReportEvidenceLoadResult> {
  const dataSources: DataSourceStatus[] = [];
  let submissions: any[] = [];
  let attendance: any[] = [];
  let progressReports: any[] = [];
  let assignments: any[] = [];

  if (studentIds.length) {
    const idList = studentIds.join(',');
    const sessionOr = coverageSessionOrFilter({
      termId: range.academicTermId,
      termLabel: range.termLabel,
      periodLabel: range.academicYear,
    });
    const [submissionResult, attendanceResult, progressResult] = await Promise.all([
      fetchAllReportRows((from, to) => admin
        .from('assignment_submissions')
        .select(
          'portal_user_id,user_id,grade,weighted_score,status,submitted_at,graded_at,assignments(max_points,course_id,program_id,term_id,courses(title,programs(name)))',
        )
        .or(`portal_user_id.in.(${idList}),user_id.in.(${idList})`)
        .range(from, to)),
      fetchAllReportRows((from, to) => admin
        .from('attendance')
        .select('user_id,student_id,status,term_id,created_at')
        .or(`user_id.in.(${idList}),student_id.in.(${idList})`)
        .range(from, to)),
      fetchAllReportRows((from, to) => {
        let query = admin
          .from('student_progress_reports')
          .select('student_id,overall_score,participation_score,attendance_score,theory_score,practical_score,is_published,term_id,report_term,report_period,areas_for_growth,key_strengths,course_name,course_id,school_id,updated_at,created_at')
          .eq('school_id', schoolId)
          .in('student_id', studentIds);
        if (sessionOr) query = query.or(sessionOr) as typeof query;
        else if (range.academicTermId) query = query.eq('term_id', range.academicTermId) as typeof query;
        return query.range(from, to);
      }),
    ]);

    submissions = ((submissionResult.data ?? []) as any[]).filter((row) =>
      submissionInReportTerm(row, range),
    );
    attendance = ((attendanceResult.data ?? []) as any[]).filter((row) =>
      attendanceInReportTerm(row, range),
    );
    progressReports = dedupeProgressReports(progressResult.data ?? []);
    dataSources.push(
      recordSource('submissions', { error: submissionResult.error, rows: submissions, checkedAt }),
      recordSource('attendance', { error: attendanceResult.error, rows: attendance, checkedAt }),
      recordSource('progress_reports', { error: progressResult.error, rows: progressReports, checkedAt }),
    );
  } else {
    dataSources.push(
      recordSource('submissions', { rows: [], checkedAt }),
      recordSource('attendance', { rows: [], checkedAt }),
      recordSource('progress_reports', { rows: [], checkedAt }),
    );
  }

  if (classIds.length) {
    const { data, error: assignmentError } = await fetchAllReportRows((from, to) => {
      let query = admin.from('assignments').select('id,term_id,created_at').in('class_id', classIds);
      if (range.academicTermId) {
        query = query.or(`term_id.eq.${range.academicTermId},and(term_id.is.null,created_at.gte.${isoStart(range.startDate)},created_at.lte.${isoEnd(range.endDate)})`) as typeof query;
      } else {
        query = query.gte('created_at', isoStart(range.startDate)).lte('created_at', isoEnd(range.endDate)) as typeof query;
      }
      return query.range(from, to);
    });
    assignments = data ?? [];
    dataSources.push(recordSource('assignments', { error: assignmentError, rows: assignments, checkedAt }));
  } else {
    dataSources.push(recordSource('assignments', { rows: [], checkedAt }));
  }

  return {
    data: { submissions, attendance, progressReports, assignments },
    dataSources,
  };
}
