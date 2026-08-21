import crypto from 'crypto';
import { courseConflictsWithClassSection } from '@/lib/reports/class-course';
import { hostSchoolScoreboard } from '@/lib/academic/host-marks';

type ReportLike = Record<string, unknown>;

const PUBLISHED_REPORT_AUXILIARY_FIELDS = new Set([
  'show_payment_notice',
  'fee_status',
  'fee_amount',
  'fee_label',
]);

/**
 * A published result is a family-visible academic record. Content corrections
 * must be a deliberate two-step operation: unpublish in Publish & Share, then
 * edit the same row in Write. Finance display fields may still be maintained
 * without changing the academic result itself.
 */
export function publishedProgressReportEditIssue(
  report: ReportLike | null | undefined,
  changes: ReportLike,
): string | null {
  if (!report?.is_published) return null;

  const mutationFields = Object.keys(changes).filter((field) => ![
    'allow_backfill',
    'expected_updated_at',
  ].includes(field));
  const unpublishOnly = changes.is_published === false
    && mutationFields.every((field) => field === 'is_published');
  if (unpublishOnly) return null;

  const auxiliaryOnly = !('is_published' in changes)
    && mutationFields.length > 0
    && mutationFields.every((field) => PUBLISHED_REPORT_AUXILIARY_FIELDS.has(field));
  if (auxiliaryOnly) return null;

  const idempotentPublish = changes.is_published === true
    && mutationFields.every((field) => field === 'is_published');
  if (idempotentPublish) return null;

  return 'This report is published and locked. Unpublish it in Publish & Share before changing academic content.';
}

export function progressReportPublishIssues(report: ReportLike): string[] {
  const issues: string[] = [];
  const text = (value: unknown) => String(value ?? '').trim();
  const score = (value: unknown) => typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  const scoreReady = (value: unknown) => Number.isFinite(score(value)) && score(value) >= 0 && score(value) <= 100;
  const metrics = report.engagement_metrics && typeof report.engagement_metrics === 'object' && !Array.isArray(report.engagement_metrics)
    ? report.engagement_metrics as Record<string, unknown>
    : {};
  const isSchoolReport = ['basic', 'secondary', 'unified', 'school'].includes(text(report.school_section));

  if (metrics.host_review_required === true) {
    issues.push('school First Test, Second Test and Examination marks must be reviewed in Write before publishing');
  }
  const hostBoard = hostSchoolScoreboard(metrics);
  if ((metrics.score_authority === 'host_school' || metrics.programme_standing === 'compulsory') && !hostBoard?.complete) {
    issues.push('First Test, Second Test and Examination marks are all required for this compulsory school report');
  }

  if (!text(report.student_id)) issues.push('student_id is required before publishing');
  if (!text(report.student_name)) issues.push('student_name is required before publishing');
  if (!text(report.section_class)) issues.push('section_class is required before publishing');
  if (!text(report.course_name)) issues.push('course_name is required before publishing');
  if (
    text(report.section_class)
    && text(report.course_name)
    && courseConflictsWithClassSection({
      sectionClass: text(report.section_class),
      courseName: text(report.course_name),
    })
  ) {
    issues.push('course_name does not match the learner\'s class programme — choose the course that matches their class before publishing');
  }
  if (!text(report.report_term)) issues.push('report_term is required before publishing');
  if (isSchoolReport && !text(report.report_period)) issues.push('report_period is required for school reports before publishing');
  if (!isSchoolReport && text(report.school_section) && !text(report.course_duration)) issues.push('course_duration is required for cohort reports before publishing');
  if (!text(report.report_date)) issues.push('report_date is required before publishing');
  if (!text(report.instructor_name)) issues.push('instructor_name is required before publishing');
  if (!scoreReady(report.theory_score)) issues.push('theory_score must be between 0 and 100 before publishing');
  if (!scoreReady(metrics.classwork_score)) issues.push('classwork_score must be between 0 and 100 before publishing');
  if (!scoreReady(report.practical_score)) issues.push('practical_score must be between 0 and 100 before publishing');
  if (!scoreReady(report.attendance_score)) issues.push('attendance_score must be between 0 and 100 before publishing');
  if (metrics.assignment_evidence_missing === true) issues.push('assignment evidence is missing; review and enter the real assignment score before publishing');
  if (metrics.attendance_evidence_missing === true) issues.push('attendance evidence is missing; review and enter the real attendance score before publishing');
  if (!scoreReady(report.participation_score)) issues.push('participation_score must be between 0 and 100 before publishing');
  if (!scoreReady(metrics.assessment_score)) issues.push('assessment_score must be between 0 and 100 before publishing');
  if (!scoreReady(report.overall_score)) issues.push('overall_score must be between 0 and 100 before publishing');
  if (!text(report.overall_grade)) issues.push('overall_grade is required before publishing');
  if (!text(report.key_strengths)) issues.push('key_strengths is required before publishing');
  if (!text(report.areas_for_growth)) issues.push('areas_for_growth is required before publishing');
  return issues;
}

export async function generateProgressReportVerificationCode(admin: any): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `RPT-${crypto.randomBytes(9).toString('base64url').toUpperCase()}`;
    const { data } = await admin.from('student_progress_reports').select('id').eq('verification_code', code).maybeSingle();
    if (!data?.id) return code;
  }
  return `RPT-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
}
