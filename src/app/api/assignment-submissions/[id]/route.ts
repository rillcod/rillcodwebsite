import { denyIfMissingCapability } from '@/lib/auth/capabilities';
import {
  hasLearnerAssignmentEvidence,
  hasProtectedAssignmentScoreEvidence,
} from '@/lib/academic/record-retention';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import { normalizeGradeValueWithMax, normalizeSubmissionStatus } from '@/lib/api-guards';
import { callerCanManageAssignmentWork } from '@/lib/assignments/authz';
import { buildAssignmentGradeTransition, gradeAssignmentRubric } from '@/lib/assignments/grading';
import { logAudit } from '@/lib/audit/log';
import {
  loadCleanupPolicy,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from '@/lib/operations/cleanup-policy';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/assignment-submissions/[id]
// Update grading state and teacher feedback on a submission.
// Student-authored evidence is immutable here; students update ungraded work through
// the assignment submit route, which applies the learner visibility and score guards.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    // getCaller admits partner schools so they can READ their students' work; writing
    // a grade or feedback is a separate question, answered once in capabilities.ts.
    const denied = denyIfMissingCapability(caller.role, 'grade');
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const { id } = await context.params;
    const admin = adminClient();

    // Fetch submission + its assignment school for boundary check (single query)
    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, assignment_id, grade, status, file_url, ai_suggested_grade, ai_suggested_feedback, grading_mode, assignments(school_id, created_by, class_id, metadata, weight, max_points)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (sub as any).assignments;
    const canManage = await callerCanManageAssignmentWork(admin as any, caller, assignment);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission belongs to an assignment outside your school scope' },
        { status: 403 },
      );
    }

    const body = await request.json();
    if ('submission_text' in body) {
      return NextResponse.json({
        error: 'Student work is read-only in the grading workflow. Ask the learner to update the ungraded submission instead.',
        code: 'IMMUTABLE_SUBMISSION_EVIDENCE',
      }, { status: 409 });
    }
    const versionResult = await admin
      .from('assignment_submissions')
      .select('version')
      .eq('id', id)
      .maybeSingle();
    const versionColumnPending = versionResult.error
      && (versionResult.error.code === '42703'
        || versionResult.error.code === 'PGRST204'
        || /version/i.test(versionResult.error.message));
    if (versionResult.error && !versionColumnPending) {
      return NextResponse.json({ error: 'The latest review version could not be verified. Please retry.' }, { status: 503 });
    }
    const currentVersion = versionColumnPending ? null : versionResult.data?.version ?? 1;
    if (body.expected_version !== undefined) {
      const expectedVersion = Number(body.expected_version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        return NextResponse.json({ error: 'expected_version must be a positive integer', field: 'expected_version' }, { status: 400 });
      }
      if (currentVersion !== null && expectedVersion !== currentVersion) {
        return NextResponse.json({
          error: 'This review changed in another session. Refresh it before saving your feedback.',
          code: 'STALE_SUBMISSION_REVIEW',
          current_version: currentVersion,
        }, { status: 409 });
      }
    }
    const assignMax = assignment?.max_points ?? 100;
    const assignWeight = assignment?.weight ?? 0;
    const rubric = Array.isArray(assignment?.metadata?.rubric) ? assignment.metadata.rubric : [];
    const action = body.action;
    if (action !== undefined && action !== 'accept_ai' && action !== 'override') {
      return NextResponse.json(
        { error: 'Invalid grading action. Use accept_ai or override.', field: 'action' },
        { status: 400 },
      );
    }
    let requestedGrade = body.grade;
    let requestedFeedback = body.feedback;
    let gradingSource = 'direct';
    let gradingDetails: Record<string, unknown> | null | undefined;
    if (action === 'accept_ai') {
      requestedGrade = sub.ai_suggested_grade;
      requestedFeedback = sub.ai_suggested_feedback;
      gradingSource = 'ai_accepted';
      gradingDetails = {
        source: gradingSource,
        suggested_grade: sub.ai_suggested_grade ?? null,
        suggested_feedback: sub.ai_suggested_feedback ?? null,
        assignment_max_points: assignMax,
      };
      if (requestedGrade == null) {
        return NextResponse.json(
          { error: 'AI suggested grade is missing. Enter a teacher score instead.', field: 'ai_suggested_grade' },
          { status: 400 },
        );
      }
    } else if (action === 'override') {
      gradingSource = 'manual_override';
      if (!('grade' in body) || body.grade == null || body.grade === '') {
        return NextResponse.json({ error: 'grade is required for override', field: 'grade' }, { status: 400 });
      }
    } else if ('rubric_scores' in body) {
      const rubricResult = gradeAssignmentRubric(rubric, body.rubric_scores, assignMax);
      if (rubricResult.error) {
        return NextResponse.json({ error: rubricResult.error, field: 'rubric_scores' }, { status: 400 });
      }
      requestedGrade = rubricResult.grade;
      gradingDetails = {
        source: 'rubric',
        rubric_scores: rubricResult.rows,
        earned_points: rubricResult.earnedPoints,
        possible_points: rubricResult.possiblePoints,
        normalized_grade: rubricResult.grade,
        assignment_max_points: assignMax,
      };
      gradingSource = 'rubric';
    } else if ('grade' in body && body.grade == null) {
      gradingDetails = null;
    }
    const gradeWasProvided = action === 'accept_ai' || 'grade' in body || 'rubric_scores' in body;
    const gradeResult = normalizeGradeValueWithMax(requestedGrade, assignMax);
    if (gradeWasProvided && gradeResult.error) {
      return NextResponse.json({ error: gradeResult.error, field: 'grade' }, { status: 400 });
    }
    if (gradeWasProvided && gradeResult.value === undefined) {
      return NextResponse.json({ error: 'grade must be a number or null', field: 'grade' }, { status: 400 });
    }
    const statusResult = normalizeSubmissionStatus(body.status);
    if ('status' in body && statusResult.error) {
      return NextResponse.json({ error: statusResult.error, field: 'status' }, { status: 400 });
    }
    if (statusResult.value === 'returned_for_revision' && !String(requestedFeedback ?? '').trim()) {
      return NextResponse.json({
        error: 'Add clear feedback so the learner knows what to revise.',
        field: 'feedback',
      }, { status: 400 });
    }

    // ── Whitelisted update fields ──────────────────────────────────────────
    // graded_by and graded_at are NOT client-settable — always set server-side
    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('feedback' in body || action === 'accept_ai') allowed.feedback = requestedFeedback ?? null;
    if (gradingDetails !== undefined) allowed.grading_details = gradingDetails;
    if (action === 'accept_ai') allowed.grading_mode = 'auto';
    if (action === 'override') allowed.grading_mode = 'manual';

    const transition = buildAssignmentGradeTransition({
      currentGrade: sub.grade ?? null,
      currentStatus: sub.status ?? null,
      grade: gradeWasProvided ? gradeResult.value ?? null : undefined,
      status: statusResult.value,
      maxPoints: assignMax,
      weight: assignWeight,
      graderId: caller.id,
    });
    if (transition.error) {
      return NextResponse.json({ error: transition.error, field: 'grade' }, { status: 400 });
    }
    Object.assign(allowed, transition.fields);
    const normalizedReason = typeof body.change_reason === 'string' ? body.change_reason.trim().slice(0, 500) : '';
    const gradeChanged = gradeWasProvided && (gradeResult.value ?? null) !== (sub.grade ?? null);
    allowed.status_changed_by = caller.id;
    allowed.last_change_reason = normalizedReason
      || (gradeChanged && sub.grade != null ? 'Teacher corrected the recorded grade' : '')
      || (transition.finalized ? 'Teacher completed the grading review' : '')
      || (statusResult.value === 'returned_for_revision' ? 'Teacher returned the work for revision' : '')
      || 'Teacher updated the submission review';


    // Keep submitted files after grading so the grade remains auditable.

    const runUpdate = async (payload: Record<string, unknown>): Promise<any> => {
      let query: any = admin
        .from('assignment_submissions')
        .update(payload)
        .eq('id', id);
      if (currentVersion !== null) query = query.eq('version', currentVersion);
      return query
        .select(currentVersion !== null
          ? 'id, grade, status, file_url, portal_user_id, weighted_score, version'
          : 'id, grade, status, file_url, portal_user_id, weighted_score')
        .maybeSingle();
    };

    let updateResult: any = await runUpdate(allowed);

    // Rolling-deploy compatibility: the final mark must never be blocked while an
    // additive migration is waiting to reach a database. The same rubric evidence
    // is included in the audit event below and storage activates automatically once
    // the column exists.
    const missingDetailsColumn = updateResult.error && gradingDetails !== undefined
      && (updateResult.error.code === '42703'
        || updateResult.error.code === 'PGRST204'
        || /grading_details/i.test(updateResult.error.message));
    if (missingDetailsColumn) {
      delete allowed.grading_details;
      console.warn('[assignment-grade] rubric storage migration is pending; preserving the rubric in the audit event', { submissionId: id });
      updateResult = await runUpdate(allowed);
    }

    const lifecycleColumnsPending = updateResult.error
      && (updateResult.error.code === '42703'
        || updateResult.error.code === 'PGRST204'
        || /status_changed_by|last_change_reason|version/i.test(updateResult.error.message));
    if (lifecycleColumnsPending) {
      delete allowed.status_changed_by;
      delete allowed.last_change_reason;
      updateResult = await admin
        .from('assignment_submissions')
        .update(allowed)
        .eq('id', id)
        .select('id, grade, status, file_url, portal_user_id, weighted_score')
        .maybeSingle();
    }

    const { data, error } = updateResult;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({
        error: 'This review changed in another session. Refresh it before saving your feedback.',
        code: 'STALE_SUBMISSION_REVIEW',
      }, { status: 409 });
    }

    try {
      await logAudit(admin as any, {
        action: transition.finalized ? 'grade_assignment_submission' : 'update_assignment_submission_review',
        actorId: caller.id,
        resourceType: 'assignment_submission',
        resourceId: id,
        tableName: 'assignment_submissions',
        oldValues: { grade: sub.grade ?? null, status: sub.status ?? null },
        newValues: {
          grade: data.grade ?? null,
          status: data.status ?? null,
          weighted_score: data.weighted_score ?? null,
          feedback_updated: 'feedback' in body || action === 'accept_ai',
          grading_source: gradingSource,
          grading_details: gradingDetails ?? null,
          change_reason: allowed.last_change_reason ?? null,
          previous_version: currentVersion,
          version: 'version' in data ? data.version : null,
        },
      });
    } catch (auditError) {
      console.warn('[assignment-grade] audit event needs reconciliation', { submissionId: id, auditError });
    }

    // Send grade email when a submission is marked graded
    if (transition.finalized && data?.portal_user_id) {
      (async () => {
        const [{ data: student }, { data: asgn }] = await Promise.all([
          admin.from('portal_users').select('email, full_name').eq('id', data.portal_user_id!).single(),
          admin.from('assignments').select('title, max_points').eq('id', sub.assignment_id).single(),
        ]);
        if (!student?.email || !asgn) return;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
        const gradeVal = (data.grade ?? allowed.grade) as number | null;
        const html = buildRillcodTransactionalEmailHtml({
          title: 'Assignment Graded',
          bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
            <p>Your assignment <strong>${escapeHtml(asgn.title || 'Assignment')}</strong> has been graded by your teacher.</p>
            ${(allowed.feedback as string) ? `<p><strong>Feedback:</strong> ${escapeHtml(allowed.feedback as string)}</p>` : ''}`,
          summaryRows: [
            { label: 'Assignment', value: asgn.title || 'Assignment' },
            { label: 'Score', value: gradeVal != null ? `${gradeVal} / ${asgn.max_points ?? 100}` : 'Graded' },
            ...(data.weighted_score != null ? [{ label: 'Weighted Score', value: String(data.weighted_score) }] : []),
          ],
          cta: { href: `${appUrl}/dashboard/assignments`, label: 'View Results & Feedback' },
          footerNote: 'This grade was submitted by your teacher.',
        });
        await queueService.queueNotification(data.portal_user_id!, 'email', {
          to: student.email,
          subject: `Graded: "${asgn.title || 'Assignment'}"`,
          html,
        });
      })().catch(console.error);
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/assignment-submissions/[id]
// Admin or teacher assigned to the assignment's school only.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    const deleteDenied = denyIfMissingCapability(caller.role, 'delete_records');
    if (deleteDenied) {
      return NextResponse.json({ error: deleteDenied.error }, { status: deleteDenied.status });
    }

    const { id } = await context.params;
    const admin = adminClient();

    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, assignment_id, submission_text, file_url, submitted_at, answers, grade, weighted_score, graded_at, graded_by, grading_mode, status, assignments(school_id, created_by, class_id, metadata)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (sub as any).assignments;
    const canManage = await callerCanManageAssignmentWork(admin as any, caller, assignment);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission belongs to an assignment outside your school scope' },
        { status: 403 },
      );
    }

    if (hasLearnerAssignmentEvidence(sub)) {
      return NextResponse.json({
        error: 'This learner has submitted work here, so it cannot be deleted. Return or correct it through the review workflow; submitted work and scores stay protected.',
        code: 'PROTECTED_ACADEMIC_EVIDENCE',
      }, { status: 409 });
    }

    const cleanupPolicy = await loadCleanupPolicy(admin as any);
    if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
      return NextResponse.json({ error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' }, { status: 409 });
    }

    const { error } = await admin.from('assignment_submissions').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(admin as any, {
      action: 'delete_ungraded_assignment_submission',
      actorId: caller.id,
      resourceType: 'assignment_submission',
      resourceId: id,
      tableName: 'assignment_submissions',
      oldValues: { status: sub.status ?? null, assignment_id: sub.assignment_id ?? null },
      newValue: 'Deleted submission with no protected score evidence',
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
