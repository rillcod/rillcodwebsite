import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSchoolProgrammePolicy } from '@/lib/academic/school-programme-standing';
import { coverageSessionOrFilter } from '@/lib/reports/academic-period';
import {
  academicPeriodWeekCount,
  loadReportCurriculumRangeSuggestion,
  type SuggestedCurriculumRange,
} from './curriculum-range';
import {
  diagnoseSchoolInvoices,
  invoiceMatchesAcademicPeriod,
  isAttachableInvoice,
  isSchoolStreamInvoice,
} from './invoice-match';
import { attendanceSourceMessage, recordSource, type DataSourceStatus } from './source-query';
import { resolveFinanceReportPeriod } from './loaders/finance';
import { buildSchoolReportBillingHrefFromPeriod, buildSchoolReportInvoiceEditHref } from './finance-links';
import { academicPeriodFromReportFields } from './academic-period';
import { attendanceInReportTerm, submissionInReportTerm } from './term-evidence';
import type { SchoolReportRange } from './loaders/types';
import {
  extractResultEntryAttendanceScores,
  filterPublishedProgressReports,
  type StudentProgressReportRow,
} from './progress-report';

type AnyClient = SupabaseClient<any>;

export type ReportPreflightCheck = {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

export type ReportPreflightResult = {
  checkedAt: string;
  readyToGenerate: boolean;
  blocking: boolean;
  sources: DataSourceStatus[];
  checks: ReportPreflightCheck[];
  curriculum: SuggestedCurriculumRange | null;
  invoiceMatchCount: number;
  matchedInvoices: Array<{ id: string; invoiceNumber: string; editHref: string }>;
  billingHref: string;
  invoiceDiagnostics: ReturnType<typeof diagnoseSchoolInvoices> | null;
};

export async function runReportPreflight(
  admin: AnyClient,
  input: {
    schoolId: string;
    academicTermId: string;
    academicYear: string;
    termLabel: string;
    academicTermNumber: number;
    startDate: string;
    endDate: string;
  },
): Promise<ReportPreflightResult> {
  const checkedAt = new Date().toISOString();
  const academicPeriodWeeks = academicPeriodWeekCount(input.startDate, input.endDate) || 1;
  const sources: DataSourceStatus[] = [];
  const checks: ReportPreflightCheck[] = [];

  const [{ data: school, error: schoolError }, { data: students, error: studentError }, { data: classes, error: classError }] =
    await Promise.all([
      admin
        .from('schools')
        .select('id,name,programme_standing,sessions_per_week,exam_capture,test_capture')
        .eq('id', input.schoolId)
        .maybeSingle(),
      admin
        .from('portal_users')
        .select('id')
        .eq('role', 'student')
        .eq('school_id', input.schoolId)
        .eq('is_active', true)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .limit(5000),
      admin.from('classes').select('id,name,teacher_id').eq('school_id', input.schoolId).limit(1000),
    ]);

  sources.push(recordSource('school', { error: schoolError, rows: school ? [school] : [], required: true, checkedAt }));
  sources.push(recordSource('students', { error: studentError, rows: students ?? [], cap: 5000, required: true, checkedAt }));
  sources.push(recordSource('classes', { error: classError, rows: classes ?? [], cap: 1000, checkedAt }));

  const studentIds = (students ?? []).map((row: { id: string }) => row.id);
  const classIds = (classes ?? []).map((row: { id: string }) => row.id);
  const programmePolicy = resolveSchoolProgrammePolicy(school ?? {});

  const [{ data: teacherSchoolRows, error: staffError }, { data: invoiceRows, error: invoiceError }, curriculum] =
    await Promise.all([
      admin.from('teacher_schools').select('teacher_id').eq('school_id', input.schoolId).limit(1000),
      admin
        .from('invoices')
        .select('id,status,metadata,stream,portal_user_id,school_id,billing_cycle_id,items,billing_cycles!invoices_billing_cycle_id_fkey(term_label)')
        .eq('school_id', input.schoolId)
        .order('created_at', { ascending: false })
        .limit(1000),
      loadReportCurriculumRangeSuggestion(admin, input.schoolId, input.academicTermId),
    ]);

  sources.push(recordSource('staff_assignments', { error: staffError, rows: teacherSchoolRows ?? [], cap: 1000, checkedAt }));

  let resultsStatus: DataSourceStatus = recordSource('results', { rows: [], checkedAt });
  let attendanceStatus: DataSourceStatus = recordSource('attendance', { rows: [], checkedAt });
  let publishedProgressCount = 0;

  if (studentIds.length) {
    const idList = studentIds.join(',');

    // Attendance rows key `student_id` to the legacy public.students row, NOT to
    // portal_users. Preflight searched portal ids on both columns and therefore
    // matched nothing, so "Attendance coverage" always read 0 here while the
    // draft — which resolves legacy ids first — showed the real figure. Same
    // resolution as loaders/evidence.ts, so the two agree.
    const { data: legacyStudents } = await admin
      .from('students')
      .select('id, user_id')
      .in('user_id', studentIds);
    const attendanceIdList = [
      ...new Set([
        ...studentIds,
        ...((legacyStudents ?? []) as Array<{ id?: string }>)
          .map((row) => row?.id)
          .filter((id): id is string => Boolean(id)),
      ]),
    ].join(',');

    const sessionOr = coverageSessionOrFilter({
      termId: input.academicTermId,
      termLabel: input.termLabel,
      periodLabel: input.academicYear,
    });
    let progressQuery = admin
      .from('student_progress_reports')
      .select('student_id,participation_score,is_published,engagement_metrics')
      .eq('school_id', input.schoolId)
      .in('student_id', studentIds)
      .limit(10000);
    if (sessionOr) progressQuery = progressQuery.or(sessionOr) as typeof progressQuery;
    else if (input.academicTermId) progressQuery = progressQuery.eq('term_id', input.academicTermId) as typeof progressQuery;

    const reportRange: SchoolReportRange = {
      startDate: input.startDate,
      endDate: input.endDate,
      curriculumStartTerm: input.academicTermNumber,
      curriculumStartWeek: 1,
      curriculumEndTerm: input.academicTermNumber,
      curriculumEndWeek: academicPeriodWeeks,
      academicTermId: input.academicTermId,
      academicYear: input.academicYear,
      termLabel: input.termLabel,
      academicTermNumber: input.academicTermNumber,
    };

    const [submissionResult, attendanceResult, progressResult] = await Promise.all([
      admin
        .from('assignment_submissions')
        .select('portal_user_id,user_id,graded_at,submitted_at,assignments(term_id,academic_offering_id,offering_period_id)')
        .or(`portal_user_id.in.(${idList}),user_id.in.(${idList})`)
        .limit(10000),
      admin
        .from('attendance')
        .select('user_id,student_id,term_id,created_at')
        .or(`user_id.in.(${attendanceIdList}),student_id.in.(${attendanceIdList})`)
        .limit(20000),
      progressQuery,
    ]);

    const termSubmissions = ((submissionResult.data ?? []) as any[]).filter((row) =>
      submissionInReportTerm(row, reportRange),
    );
    const termAttendance = ((attendanceResult.data ?? []) as any[]).filter((row) =>
      attendanceInReportTerm(row, reportRange),
    );
    const publishedProgress = filterPublishedProgressReports(
      (progressResult.data ?? []) as StudentProgressReportRow[],
    );
    publishedProgressCount = publishedProgress.length;
    const resultEntryAttendance = extractResultEntryAttendanceScores(publishedProgress);

    resultsStatus = recordSource('results', {
      error: submissionResult.error || progressResult.error,
      rows: [...termSubmissions, ...publishedProgress],
      cap: 10000,
      checkedAt,
    });
    attendanceStatus = recordSource('attendance', {
      error: attendanceResult.error,
      rows: [...termAttendance, ...resultEntryAttendance.map((rate) => ({ rate }))],
      cap: 20000,
      required: true,
      checkedAt,
      message: attendanceResult.error
        ? undefined
        : attendanceSourceMessage(termAttendance.length, resultEntryAttendance.length),
    });
  }

  sources.push(resultsStatus, attendanceStatus);

  const [{ data: curricula, error: curriculaError }, { data: tracking, error: trackingError }] = await Promise.all([
    admin
      .from('course_curricula')
      .select('id')
      .or(`school_id.eq.${input.schoolId},school_id.is.null`)
      .limit(1000),
    admin
      .from('curriculum_week_tracking')
      .select('id')
      .eq('school_id', input.schoolId)
      .limit(10000),
  ]);

  sources.push(
    recordSource('curricula', { error: curriculaError, rows: curricula ?? [], cap: 1000, checkedAt }),
    recordSource('delivery_tracking', { error: trackingError, rows: tracking ?? [], cap: 10000, checkedAt }),
  );

  if (classIds.length) {
    const { data: assignments, error: assignmentError } = await admin
      .from('assignments')
      .select('id')
      .in('class_id', classIds)
      .limit(5000);
    sources.push(recordSource('assignments', { error: assignmentError, rows: assignments ?? [], cap: 5000, checkedAt }));
  }

  sources.push(recordSource('invoices', { error: invoiceError, rows: invoiceRows ?? [], cap: 1000, checkedAt }));

  const reportPeriod = await resolveFinanceReportPeriod(admin, {
    startDate: input.startDate,
    endDate: input.endDate,
    curriculumStartTerm: input.academicTermNumber,
    curriculumStartWeek: 1,
    curriculumEndTerm: input.academicTermNumber,
    curriculumEndWeek: academicPeriodWeeks,
    academicTermId: input.academicTermId,
    academicYear: input.academicYear,
    termLabel: input.termLabel,
    academicTermNumber: input.academicTermNumber,
  });

  const invoiceMatches = ((invoiceRows ?? []) as any[])
    .filter(isSchoolStreamInvoice)
    .filter(isAttachableInvoice)
    .filter((invoice) => invoiceMatchesAcademicPeriod(invoice, reportPeriod));

  const invoiceDiagnostics =
    invoiceMatches.length === 0
      ? diagnoseSchoolInvoices((invoiceRows ?? []) as any[], reportPeriod)
      : null;

  const pushCheck = (check: ReportPreflightCheck) => checks.push(check);

  pushCheck({
    key: 'school',
    label: 'School record',
    status: school && !schoolError ? 'pass' : 'fail',
    detail: school?.name ? `${school.name} found` : 'School could not be loaded',
  });

  pushCheck({
    key: 'learners',
    label: 'Learners',
    status: studentError ? 'fail' : (students?.length ?? 0) > 0 ? 'pass' : 'warn',
    detail: studentError
      ? studentError.message
      : `${students?.length ?? 0} active learner${(students?.length ?? 0) === 1 ? '' : 's'} found`,
  });

  pushCheck({
    key: 'classes',
    label: 'Classes',
    status: classError ? 'fail' : (classes?.length ?? 0) > 0 ? 'pass' : 'warn',
    detail: classError ? classError.message : `${classes?.length ?? 0} class${(classes?.length ?? 0) === 1 ? '' : 'es'} found`,
  });

  pushCheck({
    key: 'staff',
    label: 'Staff assignments',
    status: staffError ? 'fail' : (teacherSchoolRows?.length ?? 0) > 0 ? 'pass' : 'warn',
    detail: staffError
      ? staffError.message
      : `${teacherSchoolRows?.length ?? 0} teacher assignment${(teacherSchoolRows?.length ?? 0) === 1 ? '' : 's'}`,
  });

  pushCheck({
    key: 'evaluation_path',
    label: 'Evaluation path',
    status: schoolError ? 'fail' : 'pass',
    detail: programmePolicy.usesHostEvaluation
      ? `Compulsory school path: school tests and examinations are authoritative (${programmePolicy.testCapture} tests, ${programmePolicy.examCapture} examinations); Rillcod teaching follows ${programmePolicy.sessionsPerWeek} session${programmePolicy.sessionsPerWeek === 1 ? '' : 's'} per week.`
      : `Optional school path: Rillcod teaching and CBT evaluations are authoritative across ${programmePolicy.sessionsPerWeek} session${programmePolicy.sessionsPerWeek === 1 ? '' : 's'} per week.`,
  });

  pushCheck({
    key: 'results',
    label: programmePolicy.usesHostEvaluation ? 'Host-school assessment coverage' : 'Rillcod evaluation coverage',
    status:
      resultsStatus.status === 'failed'
        ? 'fail'
        : programmePolicy.usesHostEvaluation
          ? publishedProgressCount > 0 ? 'pass' : 'warn'
          : resultsStatus.rowCount > 0 ? 'pass' : 'warn',
    detail:
      resultsStatus.status === 'failed'
        ? resultsStatus.message || 'Results query failed'
        : programmePolicy.usesHostEvaluation
          ? `${publishedProgressCount} published school assessment record${publishedProgressCount === 1 ? '' : 's'}; assignment evidence does not replace the school examination path.`
          : `${resultsStatus.rowCount} verified Rillcod result/submission row${resultsStatus.rowCount === 1 ? '' : 's'}`,
  });

  pushCheck({
    key: 'attendance',
    label: 'Attendance coverage',
    status: attendanceStatus.status === 'failed' ? 'fail' : attendanceStatus.rowCount > 0 ? 'pass' : 'warn',
    detail:
      attendanceStatus.status === 'failed'
        ? attendanceStatus.message || 'Attendance query failed'
        : attendanceStatus.message ||
          `${attendanceStatus.rowCount} attendance row${attendanceStatus.rowCount === 1 ? '' : 's'}`,
  });

  pushCheck({
    key: 'curriculum',
    label: 'Curriculum detection',
    status:
      curriculum?.status === 'query_failed' || curriculum?.status === 'migration_missing'
        ? 'fail'
        : curriculum?.status === 'detected'
          ? 'pass'
          : 'warn',
    detail: curriculum?.hint || 'Curriculum range not checked yet',
  });

  pushCheck({
    key: 'invoice',
    label: 'Matching invoice',
    status: invoiceError ? 'fail' : invoiceMatches.length > 0 ? 'pass' : 'warn',
    detail: invoiceError
      ? invoiceError.message
      : invoiceMatches.length > 0
        ? `${invoiceMatches.length} invoice attached for this term`
        : 'No matching school invoice yet — create one in Finance before publishing',
  });

  const period = academicPeriodFromReportFields({
    academicYear: reportPeriod.academicYear,
    termLabel: reportPeriod.termLabel,
    academicTermNumber: reportPeriod.academicTermNumber,
    academicTermId: reportPeriod.academicTermId,
  });

  const matchedInvoices = invoiceMatches.map((invoice: any) => ({
    id: String(invoice.id),
    invoiceNumber: String(invoice.invoice_number || invoice.id),
    editHref: buildSchoolReportInvoiceEditHref(String(invoice.id)),
  }));

  const billingHref = buildSchoolReportBillingHrefFromPeriod(
    input.schoolId,
    period,
    matchedInvoices[0]?.id ?? null,
  );

  const blocking = checks.some((check) => check.status === 'fail') || sources.some((s) => s.required && s.status === 'failed');
  const readyToGenerate = !blocking && Boolean(school) && !schoolError;

  return {
    checkedAt,
    readyToGenerate,
    blocking,
    sources,
    checks,
    curriculum,
    invoiceMatchCount: invoiceMatches.length,
    matchedInvoices,
    billingHref,
    invoiceDiagnostics,
  };
}
