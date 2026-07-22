import { generateProgressReportVerificationCode, progressReportPublishIssues } from './publication';
import { reconcileReportCourseFromClassContext } from './class-course';

export type PublishReportResult =
  | { ok: true; report: any }
  | { ok: false; status: number; error: string; issues?: string[] };

export async function publishProgressReport(admin: any, reportId: string, changes: Record<string, unknown> = {}): Promise<PublishReportResult> {
  const { data: current, error: loadError } = await admin.from('student_progress_reports').select('*').eq('id', reportId).maybeSingle();
  if (loadError) return { ok: false, status: 500, error: loadError.message };
  if (!current) return { ok: false, status: 404, error: 'Report not found' };
  if (current.is_published && Object.keys(changes).length === 0) return { ok: true, report: current };

  const merged = { ...current, ...changes };
  const reconciled = await reconcileReportCourseFromClassContext(admin, {
    course_id: merged.course_id,
    course_name: merged.course_name,
    section_class: merged.section_class,
    student_id: merged.student_id,
  });

  const candidate = {
    ...merged,
    ...changes,
    course_id: reconciled.course_id ?? merged.course_id,
    course_name: reconciled.course_name ?? merged.course_name,
    is_published: true,
  };
  const issues = progressReportPublishIssues(candidate);
  if (issues.length) return { ok: false, status: 400, error: 'Report is not ready to publish', issues };
  const verificationCode = current.verification_code || await generateProgressReportVerificationCode(admin);
  const now = new Date().toISOString();
  const { data, error } = await admin.from('student_progress_reports').update({
    ...changes,
    course_id: candidate.course_id,
    course_name: candidate.course_name,
    is_published: true,
    // Keep the original publish timestamp on re-publish of an already-live report.
    published_at: current.published_at || now,
    verification_code: verificationCode,
    updated_at: now,
  }).eq('id', reportId).select('*').single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, report: data };
}