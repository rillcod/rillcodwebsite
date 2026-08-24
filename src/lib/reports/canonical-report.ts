import { normalizePeriodLabel, normalizeTermLabel } from '@/lib/reports/academic-period';
import { isLockedLearnerResult } from '@/lib/reports/score';
import { isPlaceholderReportSession } from '@/lib/reports/session-labels';

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
  updated_at: string | null;
  term_id?: string | null;
  theory_score?: unknown;
  practical_score?: unknown;
  attendance_score?: unknown;
  participation_score?: unknown;
  overall_score?: unknown;
  engagement_metrics?: unknown;
};

const SELECT =
  'id,calculation_mode,is_published,course_id,course_name,report_term,report_period,term_id,theory_score,practical_score,attendance_score,participation_score,overall_score,engagement_metrics,updated_at';

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
    termId?: string | null;
    academicOfferingId?: string | null;
    offeringPeriodId?: string | null;
  },
): Promise<CanonicalProgressReport | null> {
  const studentId = String(input.studentId || '').trim();
  if (!studentId) return null;

  const term = normalizeTermLabel(String(input.reportTerm || '').trim());
  const period = normalizePeriodLabel(String(input.reportPeriod || '').trim());
  const courseId = String(input.courseId || '').trim();
  const courseName = String(input.courseName || '').trim();
  const termId = String(input.termId || '').trim();
  const offeringId = String(input.academicOfferingId || '').trim();
  const offeringPeriodId = String(input.offeringPeriodId || '').trim();

  const byStudent = () => admin.from('student_progress_reports').select(SELECT).eq('student_id', studentId);

  if (courseId && termId) {
    const { data } = await newest(byStudent().eq('course_id', courseId).eq('term_id', termId));
    if (data?.id) return data;
  }
  if (courseId && term && period) {
    const { data } = await newest(byStudent().eq('course_id', courseId).eq('report_term', term).eq('report_period', period));
    if (data?.id) return data;
  }
  if (courseName && term && period) {
    const { data } = await newest(byStudent().ilike('course_name', courseName).eq('report_term', term).eq('report_period', period));
    if (data?.id) return data;
  }
  if (courseId && (term || period || termId)) {
    const { data: rows } = await newestFew(byStudent().eq('course_id', courseId), 10);
    const list = Array.isArray(rows) ? rows : [];
    const placeholderMatches = list.filter((row) => {
      if (!isPlaceholderReportSession(row.report_term, row.report_period)) return false;
      if (termId) return String(row.term_id || '') === termId;
      if (term && period) {
        return normalizeTermLabel(row.report_term) === term || normalizePeriodLabel(row.report_period) === period;
      }
      return true;
    });
    if (placeholderMatches.length === 1 && placeholderMatches[0]?.id) return placeholderMatches[0];
  }
  if (term && period) {
    const { data } = await newestFew(byStudent().eq('report_term', term).eq('report_period', period), 2);
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 1 && rows[0]?.id) return rows[0];
  }
  if (termId && !courseId && !courseName) {
    const { data } = await newestFew(byStudent().eq('term_id', termId), 2);
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 1 && rows[0]?.id) return rows[0];
  }
  if (courseId && offeringId && offeringPeriodId) {
    const base = byStudent()
      .eq('course_id', courseId)
      .eq('academic_offering_id', offeringId)
      .eq('offering_period_id', offeringPeriodId);
    if (termId) {
      const { data } = await newest(base.eq('term_id', termId));
      if (data?.id) return data;
    }
    if (term && period) {
      const { data } = await newest(base.eq('report_term', term).eq('report_period', period));
      if (data?.id) return data;
    }
    // Offering ids alone must not pick a prior academic session — only placeholder rows.
    const { data: rows } = await newestFew(base, 5);
    const list = Array.isArray(rows) ? rows : [];
    const placeholderMatches = list.filter((row) =>
      isPlaceholderReportSession(row.report_term, row.report_period),
    );
    if (placeholderMatches.length === 1 && placeholderMatches[0]?.id) return placeholderMatches[0];
  }
  return null;
}

export function isReusableLockedResult(row: CanonicalProgressReport | null | undefined): boolean {
  return Boolean(row && isLockedLearnerResult(row));
}
