import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database, TablesUpdate } from '@/types/supabase';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { publishProgressReport } from '@/lib/reports/publish-service';
import { queueProgressReportPublicationDelivery, type ProgressReportDeliveryResult } from '@/lib/reports/publication-delivery';
import { reconcileReportCourseFromClassContext } from '@/lib/reports/class-course';
import { canAccessProgressReport } from '@/lib/reports/access';
import {
  resolveSessionForWrite,
  sessionsEqual,
} from '@/lib/reports/academic-period';
import { logAudit } from '@/lib/audit/log';
import { deriveHostSchoolReportResult, deriveProgressReportResult, touchesProgressReportScores } from '@/lib/reports/score';
import { parseScoreAuthority } from '@/lib/reports/complement';
import { loadEffectiveScoreWeights } from '@/lib/grading-scheme';
import { publishedProgressReportEditIssue } from '@/lib/reports/publication';
import { mergeHostSchoolMetrics } from '@/lib/academic/host-marks';
import {
  loadCleanupPolicy,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from '@/lib/operations/cleanup-policy';

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id, full_name')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'teacher')) return null;
  return profile;
}

type ReportAccessResult = { ok: true; transfer?: boolean } | { ok: false; status: number; error: string };

async function canModifyReport(caller: any, reportId: string): Promise<ReportAccessResult> {
  if (caller.role === 'admin') return { ok: true };
  const admin = adminClient();
  const { data: report, error: reportError } = await admin.from('student_progress_reports')
    .select('id, school_id, student_id, teacher_id, class_id').eq('id', reportId).maybeSingle();
  if (reportError) {
    console.error('[progress-reports] report access verification failed:', reportError);
    return { ok: false, status: 503, error: 'Report access could not be verified. Please try again.' };
  }
  if (!report) return { ok: false, status: 404, error: 'Report not found' };

  const access = await canAccessProgressReport(admin, caller, report as any, { transferOwnership: true });
  if (!access.ok) return { ok: false, status: 403, error: 'This report is outside your assigned class or school.' };

  // Permission and ownership transfer are deliberately separate. The actual
  // transfer is included in the same version-guarded PATCH below, so a stale or
  // failed action never changes authorship by itself.
  return { ok: true, transfer: access.transfer === true };
}

// PATCH /api/progress-reports/[id] — update specific fields (e.g. course_name)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const access = await canModifyReport(caller, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json();
  const hasExpectedUpdatedAt = Object.prototype.hasOwnProperty.call(body, 'expected_updated_at');
  const expectedUpdatedAt = typeof body.expected_updated_at === 'string' && body.expected_updated_at.trim()
    ? body.expected_updated_at.trim()
    : null;

  const allowed: Record<string, any> = {};
  const fields = [
    'course_name', 'report_term', 'report_period', 'report_date',
    'theory_score', 'practical_score', 'attendance_score', 'is_published', 'learning_milestones', 'instructor_name',
    'participation_score', 'engagement_metrics',
    'participation_grade', 'projects_grade', 'homework_grade',
    'proficiency_level', 'has_certificate', 'certificate_text',
    'course_completed', 'photo_url',
    'fee_status', 'fee_amount', 'fee_label', 'show_payment_notice',
    'school_section', 'course_id', 'course_duration',
    'key_strengths', 'areas_for_growth',
    'current_module', 'next_module',
    // Student identity corrections — sync back to portal_users + students
    'section_class', 'student_name', 'gender',
  ];
  fields.forEach(f => { if (f in body) allowed[f] = body[f]; });
  if (!fields.some((field) => field in body)) {
    return NextResponse.json({
      error: 'No supported report change was provided.',
      code: 'REPORT_CHANGE_REQUIRED',
    }, { status: 400 });
  }
  allowed.updated_at = new Date().toISOString();
  // Unpublishing clears the stamp so the next publish records a fresh published_at.
  if (allowed.is_published === false) allowed.published_at = null;

  const admin = adminClient();

  const { data: currentReport, error: currentReportError } = await admin
    .from('student_progress_reports')
    .select('student_id, student_name, section_class, school_id, class_id, course_id, course_name, term_id, academic_offering_id, report_term, report_period, teacher_id, instructor_name, is_published, academic_trace_status, academic_qa_status, theory_score, practical_score, attendance_score, participation_score, engagement_metrics, overall_score, overall_grade, calculation_mode, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (currentReportError) {
    return NextResponse.json({ error: 'The report could not be verified before saving. Please try again.' }, { status: 503 });
  }
  if (!currentReport) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (!hasExpectedUpdatedAt) {
    return NextResponse.json({
      error: 'Reload this report before changing it so the latest version is protected.',
      code: 'REPORT_VERSION_REQUIRED',
    }, { status: 428 });
  }

  const publishedIssue = publishedProgressReportEditIssue(
    currentReport as Record<string, unknown>,
    body as Record<string, unknown>,
  );
  if (publishedIssue) {
    return NextResponse.json({ error: publishedIssue, code: 'PUBLISHED_REPORT_LOCKED' }, { status: 409 });
  }
  if ((expectedUpdatedAt ?? null) !== ((currentReport as any).updated_at ?? null)) {
    return NextResponse.json({
      error: 'This report changed after you opened it. Reload the latest version before saving.',
      code: 'STALE_REPORT_DRAFT',
    }, { status: 409 });
  }

  if (access.transfer && caller.role === 'teacher' && (currentReport as any).teacher_id !== caller.id) {
    allowed.teacher_id = caller.id;
    if (!('instructor_name' in body) && caller.full_name) allowed.instructor_name = caller.full_name;
  }

  // Central session resolve on PATCH (same rules as POST). Resubmitting the
  // stored term — e.g. a course rename — must not roll a prior report to live.
  if ('report_term' in allowed || 'report_period' in allowed) {
    const storedTerm = String((currentReport as any)?.report_term ?? '').trim();
    const storedPeriod = String((currentReport as any)?.report_period ?? '').trim();
    const nextTerm = String(allowed.report_term ?? storedTerm).trim();
    const nextPeriod = String(allowed.report_period ?? storedPeriod).trim();
    const sameSession = sessionsEqual(
      { termLabel: nextTerm, periodLabel: nextPeriod },
      { termLabel: storedTerm, periodLabel: storedPeriod },
    );
    const allowBackfill = body.allow_backfill === true || sameSession;
    const { session } = resolveSessionForWrite(nextTerm, nextPeriod, { allowBackfill });
    allowed.report_term = session.termLabel;
    allowed.report_period = session.periodLabel;
    if (allowed.report_term && allowed.report_period) {
      const { data: canonicalTerm, error: canonicalTermError } = await admin.from('academic_terms').select('id')
        .eq('term_label', allowed.report_term)
        .eq('academic_year', allowed.report_period)
        .maybeSingle();
      if (canonicalTermError) {
        return NextResponse.json({ error: 'The academic term could not be verified. Please try again.' }, { status: 503 });
      }
      if (canonicalTerm?.id) allowed.term_id = canonicalTerm.id;
    }
  }

  if (touchesProgressReportScores(body as Record<string, unknown>)) {
    allowed.calculation_mode = 'manual';
    const mergedMetrics =
      allowed.engagement_metrics && typeof allowed.engagement_metrics === 'object' && !Array.isArray(allowed.engagement_metrics)
        ? mergeHostSchoolMetrics((currentReport as any)?.engagement_metrics, allowed.engagement_metrics)
        : (currentReport as any)?.engagement_metrics;
    if ('engagement_metrics' in allowed) allowed.engagement_metrics = mergedMetrics;
    if (parseScoreAuthority(mergedMetrics) === 'host_school') {
      const hostResult = deriveHostSchoolReportResult(mergedMetrics);
      if (hostResult) {
        allowed.overall_score = hostResult.overallScore;
        allowed.overall_grade = hostResult.overallGrade;
      } else {
        // Partial papers remain editable draft evidence, never an official 0/F9
        // and never an older total left behind after a paper is cleared.
        allowed.overall_score = null;
        allowed.overall_grade = null;
      }
    } else {
      try {
        const weighting = await loadEffectiveScoreWeights(admin as any, {
          schoolId: (currentReport as any)?.school_id,
          courseId: allowed.course_id ?? (currentReport as any)?.course_id,
          termId: allowed.term_id ?? (currentReport as any)?.term_id,
          academicOfferingId: (currentReport as any)?.academic_offering_id,
        });
        const result = deriveProgressReportResult({ ...(currentReport as any), ...allowed }, weighting.weights);
        allowed.overall_score = result.overallScore;
        allowed.overall_grade = result.overallGrade;
      } catch (cause) {
        return NextResponse.json({
          error: cause instanceof Error ? cause.message : 'The active result-weighting policy could not be loaded.',
        }, { status: 500 });
      }
    }
  }

  // Direct overall-score overrides are intentionally ignored; evidence components
  // are the only input to the official calculation.
  // Never rewrite a stored course from the learner's current class. Only fill
  // blanks when this PATCH actually touches course/section fields.
  if ('course_id' in body || 'course_name' in body || 'section_class' in body) {
    const reconciledCourse = await reconcileReportCourseFromClassContext(admin, {
      course_id: allowed.course_id ?? (currentReport as any)?.course_id,
      course_name: allowed.course_name ?? (currentReport as any)?.course_name,
      section_class: allowed.section_class ?? (currentReport as any)?.section_class,
      class_id: (currentReport as any)?.class_id,
    });
    if (!allowed.course_id && !(currentReport as any)?.course_id && reconciledCourse.course_id) {
      allowed.course_id = reconciledCourse.course_id;
    }
    if (!('course_name' in body) && !(currentReport as any)?.course_name && reconciledCourse.course_name) {
      allowed.course_name = reconciledCourse.course_name;
    }
  }

  if (allowed.is_published === true && (currentReport as any)?.academic_trace_status === 'traceable'
    && parseScoreAuthority((currentReport as any)?.engagement_metrics) !== 'host_school') {
    const { data: qa, error: qaError } = await (admin as any).rpc('evaluate_progress_report_academic_qa', {
      p_report_id: id,
    });
    if (qaError) return NextResponse.json({ error: qaError.message }, { status: 400 });
    if ((qa as any)?.status !== 'ready') {
      return NextResponse.json({
        error: 'This report is not ready to publish yet. Finish the scores in Write first.',
        academic_quality: qa,
      }, { status: 409 });
    }
  }

  let data: any;
  let error: any;
  let newlyPublished = false;
  if (allowed.is_published === true) {
    const publishResult = await publishProgressReport(
      admin,
      id,
      allowed as Record<string, unknown>,
      { expectedUpdatedAt },
    );
    if (!publishResult.ok) return NextResponse.json({ error: publishResult.error, code: publishResult.code, issues: publishResult.issues }, { status: publishResult.status });
    data = publishResult.report;
    newlyPublished = publishResult.newlyPublished;
  } else {
    let updateQuery = admin
      .from('student_progress_reports')
      .update(allowed as TablesUpdate<'student_progress_reports'>)
      .eq('id', id);
    updateQuery = expectedUpdatedAt
      ? updateQuery.eq('updated_at', expectedUpdatedAt)
      : updateQuery.is('updated_at', null);
    const updateResult = await updateQuery
      .select('id, student_id, course_name, overall_score, overall_grade, is_published, verification_code, updated_at')
      .maybeSingle();
    data = updateResult.data;
    error = updateResult.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({
      error: 'This report changed while you were editing it. Reload the latest version before saving.',
      code: 'STALE_REPORT_DRAFT',
    }, { status: 409 });
  }

  if (data && typeof body.is_published !== 'boolean') {
    await logAudit(admin as any, {
      action: 'update_progress_report',
      actorId: caller.id,
      resourceType: 'progress_report',
      resourceId: id,
      tableName: 'student_progress_reports',
      oldValues: { overall_score: (currentReport as any)?.overall_score ?? null, overall_grade: (currentReport as any)?.overall_grade ?? null },
      newValues: {
        overall_score: data.overall_score ?? null,
        overall_grade: data.overall_grade ?? null,
        fields: Object.keys(allowed),
        ownership_transferred: access.transfer === true,
      },
    });
  }

  if (typeof body.is_published === 'boolean' && data) {
    const wasPublished = !!(currentReport as any)?.is_published;
    if (body.is_published && !wasPublished) {
      await logAudit(admin as any, {
        action: 'publish_progress_report',
        actorId: caller.id,
        resourceType: 'progress_report',
        resourceId: id,
        tableName: 'student_progress_reports',
        newValue: (currentReport as any)?.student_name || data.course_name || id,
        newValues: {
          student_id: data.student_id,
          student_name: (currentReport as any)?.student_name ?? null,
          course_name: data.course_name ?? null,
          overall_grade: data.overall_grade ?? null,
        },
      });
    } else if (!body.is_published && wasPublished) {
      await logAudit(admin as any, {
        action: 'unpublish_progress_report',
        actorId: caller.id,
        resourceType: 'progress_report',
        resourceId: id,
        tableName: 'student_progress_reports',
        newValue: (currentReport as any)?.student_name || data.course_name || id,
        newValues: {
          student_id: data.student_id,
          student_name: (currentReport as any)?.student_name ?? null,
          course_name: data.course_name ?? null,
        },
      });
    }
  }

  let delivery: ProgressReportDeliveryResult | null = null;
  if (newlyPublished && data?.student_id) {
    delivery = await queueProgressReportPublicationDelivery(admin as any, data, caller.id);
  }

  return NextResponse.json({ data, delivery });
}

// DELETE /api/progress-reports/[id] — delete a report
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const access = await canModifyReport(caller, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = adminClient();
  const { data: existing } = await admin
    .from('student_progress_reports')
    .select('id, student_id, student_name, course_name, is_published, calculation_mode, theory_score, practical_score, attendance_score, participation_score, engagement_metrics, overall_score')
    .eq('id', id)
    .maybeSingle();
  if (existing) {
    const metrics = existing.engagement_metrics && typeof existing.engagement_metrics === 'object'
      ? existing.engagement_metrics as Record<string, unknown>
      : {};
    const hasRecordedScore = existing.calculation_mode === 'manual' || existing.is_published || [
      existing.theory_score, existing.practical_score, existing.attendance_score,
      existing.participation_score, existing.overall_score,
      metrics.classwork_score, metrics.assessment_score,
    ].some((value) => value !== null && value !== undefined);
    if (hasRecordedScore) return NextResponse.json({
      error: 'This report has recorded scores. Unpublish to correct it, or archive the learner. Recorded scores cannot be deleted.',
      code: 'PROTECTED_ACADEMIC_EVIDENCE',
    }, { status: 409 });
  }
  const cleanupPolicy = await loadCleanupPolicy(admin as any);
  if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
    return NextResponse.json({ error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' }, { status: 409 });
  }
  const { error } = await admin
    .from('student_progress_reports')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (existing) {
    await logAudit(admin as any, {
      action: 'delete_progress_report',
      actorId: caller.id,
      resourceType: 'progress_report',
      resourceId: id,
      tableName: 'student_progress_reports',
      oldValue: existing.student_name || existing.course_name || id,
      newValues: {
        student_id: existing.student_id,
        student_name: existing.student_name,
        course_name: existing.course_name,
        was_published: existing.is_published,
      },
    });
  }
  return NextResponse.json({ success: true });
}
