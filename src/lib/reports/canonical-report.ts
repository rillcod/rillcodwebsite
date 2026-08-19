import { isLockedLearnerResult } from '@/lib/reports/score';

type ReportLookupClient = {
  from: (table: string) => any;
};

export type CanonicalProgressReport = {
  id: string;
  calculation_mode: string | null;
  is_published: boolean | null;
  course_id: string | null;
  course_name: string | null;
  report_term: string | null;
  report_period: string | null;
  theory_score?: unknown;
  practical_score?: unknown;
  attendance_score?: unknown;
  participation_score?: unknown;
  overall_score?: unknown;
  engagement_metrics?: unknown;
};

const SELECT =
  'id,calculation_mode,is_published,course_id,course_name,report_term,report_period,theory_score,practical_score,attendance_score,participation_score,overall_score,engagement_metrics';

function newest(query: any) {
  return query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
}

function newestFew(query: any, n: number) {
  return query.order('updated_at', { ascending: false }).limit(n);
}

/**
 * One learner report per course and term. Write, Auto-fill, and Publish all land
 * on this row — never a second gradebook line.
 */
export async function findCanonicalProgressReport(
  admin: ReportLookupClient,
  input: {
    studentId: string;
    courseId?: string | null;
    courseName?: string | null;
    reportTerm?: string | null;
    reportPeriod?: string | null;
    academicOfferingId?: string | null;
    offeringPeriodId?: string | null;
  },
): Promise<CanonicalProgressReport | null> {
  const studentId = String(input.studentId || '').trim();
  if (!studentId) return null;

  const term = String(input.reportTerm || '').trim();
  const period = String(input.reportPeriod || '').trim();
  const courseId = String(input.courseId || '').trim();
  const courseName = String(input.courseName || '').trim();
  const offeringId = String(input.academicOfferingId || '').trim();
  const offeringPeriodId = String(input.offeringPeriodId || '').trim();

  const byStudent = () => admin.from('student_progress_reports').select(SELECT).eq('student_id', studentId);

  if (courseId && term && period) {
    const { data } = await newest(byStudent().eq('course_id', courseId).eq('report_term', term).eq('report_period', period));
    if (data?.id) return data;
  }
  if (courseName && term && period) {
    const { data } = await newest(byStudent().ilike('course_name', courseName).eq('report_term', term).eq('report_period', period));
    if (data?.id) return data;
  }
  if (term && period) {
    const { data } = await newestFew(byStudent().eq('report_term', term).eq('report_period', period), 2);
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 1 && rows[0]?.id) return rows[0];
  }
  if (courseId && offeringId && offeringPeriodId) {
    const { data } = await newest(
      byStudent().eq('course_id', courseId).eq('academic_offering_id', offeringId).eq('offering_period_id', offeringPeriodId),
    );
    if (data?.id) return data;
  }
  return null;
}

export function isReusableLockedResult(row: CanonicalProgressReport | null | undefined): boolean {
  return Boolean(row && isLockedLearnerResult(row));
}
