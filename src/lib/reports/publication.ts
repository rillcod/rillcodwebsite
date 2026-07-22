import crypto from 'crypto';
import { courseConflictsWithClassSection } from '@/lib/reports/class-course';

type ReportLike = Record<string, unknown>;

export function progressReportPublishIssues(report: ReportLike): string[] {
  const issues: string[] = [];
  const text = (value: unknown) => String(value ?? '').trim();
  const score = (value: unknown) => typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  const scoreReady = (value: unknown) => Number.isFinite(score(value)) && score(value) >= 0 && score(value) <= 100;
  const metrics = report.engagement_metrics && typeof report.engagement_metrics === 'object' && !Array.isArray(report.engagement_metrics)
    ? report.engagement_metrics as Record<string, unknown>
    : {};
  const isSchoolReport = ['basic', 'secondary', 'unified', 'school'].includes(text(report.school_section));

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