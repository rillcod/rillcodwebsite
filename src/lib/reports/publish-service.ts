import { generateProgressReportVerificationCode, progressReportPublishIssues } from './publication';
import { reconcileReportCourseFromClassContext } from './class-course';

export type PublishReportResult =
  | { ok: true; report: any; newlyPublished: boolean }
  | { ok: false; status: number; error: string; code?: string; issues?: string[] };

type PublishReportOptions = {
  /** The version shown to the person publishing. Explicit null protects legacy rows. */
  expectedUpdatedAt?: string | null;
};

const STALE_REPORT_ERROR = 'This report changed after you opened it. Reload the latest draft before publishing so no work is overwritten.';

export async function publishProgressReport(
  admin: any,
  reportId: string,
  changes: Record<string, unknown> = {},
  options: PublishReportOptions = {},
): Promise<PublishReportResult> {
  const { data: current, error: loadError } = await admin.from('student_progress_reports').select('*').eq('id', reportId).maybeSingle();
  if (loadError) return { ok: false, status: 500, error: loadError.message };
  if (!current) return { ok: false, status: 404, error: 'Report not found' };
  if (current.is_published && Object.keys(changes).length === 0) return { ok: true, report: current, newlyPublished: false };
  const callerSuppliedVersion = Object.prototype.hasOwnProperty.call(options, 'expectedUpdatedAt');
  if (callerSuppliedVersion && (options.expectedUpdatedAt ?? null) !== (current.updated_at ?? null)) {
    return { ok: false, status: 409, error: STALE_REPORT_ERROR, code: 'STALE_REPORT_DRAFT' };
  }

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
  let updateQuery = admin.from('student_progress_reports').update({
    ...changes,
    course_id: candidate.course_id,
    course_name: candidate.course_name,
    is_published: true,
    // Keep the original publish timestamp on re-publish of an already-live report.
    published_at: current.published_at || now,
    verification_code: verificationCode,
    updated_at: now,
  }).eq('id', reportId);
  // Guard every publication, even when the caller did not supply a version.
  // The caller version protects the open browser; this predicate protects the
  // short load -> validate -> publish window inside this service.
  updateQuery = current.updated_at
    ? updateQuery.eq('updated_at', current.updated_at)
    : updateQuery.is('updated_at', null);
  // Only one concurrent request may own the unpublished → published transition.
  // Later requests can still retrieve the live report, but must not duplicate delivery.
  if (!current.is_published) updateQuery = updateQuery.or('is_published.eq.false,is_published.is.null');
  const { data, error } = await updateQuery.select('*').maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data && !current.is_published) {
    const { data: live, error: reloadError } = await admin
      .from('student_progress_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();
    if (reloadError) return { ok: false, status: 500, error: reloadError.message };
    if (!live) return { ok: false, status: 404, error: 'Report not found' };
    if (!live.is_published && (live.updated_at ?? null) !== (current.updated_at ?? null)) {
      return { ok: false, status: 409, error: STALE_REPORT_ERROR, code: 'STALE_REPORT_DRAFT' };
    }
    if (!live.is_published) {
      return { ok: false, status: 503, error: 'The report publication transition could not be completed. Please try again.' };
    }
    return { ok: true, report: live, newlyPublished: false };
  }
  return { ok: true, report: data, newlyPublished: !current.is_published };
}
