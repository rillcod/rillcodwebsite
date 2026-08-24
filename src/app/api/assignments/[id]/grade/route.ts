import { denyIfMissingCapability } from '@/lib/auth/capabilities';
import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import type { Database } from '@/types/supabase';
import { normalizeGradeValueWithMax, normalizeSubmissionStatus } from '@/lib/api-guards';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import {
  assignmentVisibleToStudent,
  resolveStudentProgramScope,
  type AssignmentStudentScope,
} from '@/lib/assignments/visibility';
import { callerCanManageAssignmentWork } from '@/lib/assignments/authz';
import {
  buildAssignmentGradeTransition,
} from '@/lib/assignments/grading';
import { PATCH as updateAssignmentSubmission } from '@/app/api/assignment-submissions/[id]/route';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient<Database>(
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
  return (caller as Caller) ?? null;
}

async function getStudentClassTeacherId(admin: ReturnType<typeof adminClient>, classId: string | null): Promise<string | null> {
  if (!classId) return null;
  const { data } = await admin
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .maybeSingle();
  return data?.teacher_id ?? null;
}

async function sendGradeNotifications(
  admin: ReturnType<typeof adminClient>,
  studentId: string,
  assignmentTitle: string,
  grade: number | null | undefined,
  assignMax: number,
  weightedScore: number | null | undefined,
  feedback?: string | null,
) {
  const { data: student } = await admin
    .from('portal_users').select('email, full_name').eq('id', studentId).single();
  if (!student) return;

  // ── In-app notification (always) ──────────────────────────────────────────
  const scoreLabel = grade != null ? `${grade}/${assignMax}` : 'graded';
  await admin.from('notifications').insert({
    user_id: studentId,
    title: 'Assignment Graded',
    message: `"${assignmentTitle}" has been graded — score: ${scoreLabel}.${feedback ? ' Feedback left by your teacher.' : ''}`,
    type: 'success',
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.error('[grade notification]', error.message); });

  // ── Email (only if address exists) ────────────────────────────────────────
  if (!student.email) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
  const html = buildRillcodTransactionalEmailHtml({
    title: 'Assignment Graded',
    bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
      <p>Your assignment <strong>${escapeHtml(assignmentTitle)}</strong> has been graded by your teacher.</p>
      ${feedback ? `<p><strong>Feedback:</strong> ${escapeHtml(feedback)}</p>` : ''}`,
    summaryRows: [
      { label: 'Assignment', value: assignmentTitle },
      { label: 'Score', value: `${grade ?? 'N/A'} / ${assignMax}` },
      ...(weightedScore != null ? [{ label: 'Weighted Score', value: String(weightedScore) }] : []),
    ],
    cta: { href: `${appUrl}/dashboard/assignments`, label: 'View Results & Feedback' },
    footerNote: 'This grade was submitted by your teacher.',
  });
  await queueService.queueNotification(studentId, 'email', {
    to: student.email,
    subject: `Graded: "${assignmentTitle}"`,
    html,
  });
}

function forwardToCanonicalSubmissionReview(
  request: NextRequest,
  body: Record<string, unknown>,
  submissionId: string,
) {
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  const canonicalRequest = new NextRequest(request.url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return updateAssignmentSubmission(canonicalRequest, {
    params: Promise.resolve({ id: submissionId }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments/[id]/grade
// Grades a submission or creates a graded one if none exists yet.
// Body: { submission_id?, student_id?, grade, feedback?, status?, submission_text? }
// Teacher must be in the assignment's school or have created it.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Grading is a Rillcod-staff action. A partner-school account previously passed
    // this guard and could grade via a direct API call, even though the dashboard
    // hides grading from it — the API and the UI now answer from the same place.
    const denied = denyIfMissingCapability(caller.role, 'grade');
    if (denied) {
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }

    const { id: assignment_id } = await context.params;
    const admin = adminClient();

    // Fetch assignment to verify access + get weight/max_points
    const { data: assignment } = await admin
      .from('assignments')
      .select('weight, max_points, school_id, school_name, course_id, program_id, created_by, title, metadata, class_id')
      .eq('id', assignment_id)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const canManage = await callerCanManageAssignmentWork(admin as any, caller, assignment as any);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: assignment is outside your class/school scope' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { submission_id, student_id, grade, feedback, status, submission_text } = body;

    // Existing submissions always use the canonical grading workflow. This keeps
    // score normalization, evidence protection, weighted marks, audit, and learner
    // notification behavior identical across Class, Project, Assignment and Queue UI.
    if (submission_id) {
      const { data: targetSubmission, error: targetSubmissionError } = await admin
        .from('assignment_submissions')
        .select('id, assignment_id, version')
        .eq('id', submission_id)
        .maybeSingle();
      if (targetSubmissionError) {
        return NextResponse.json({ error: targetSubmissionError.message }, { status: 500 });
      }
      if (!targetSubmission || targetSubmission.assignment_id !== assignment_id) {
        return NextResponse.json({ error: 'Submission not found on this assignment' }, { status: 404 });
      }
      return forwardToCanonicalSubmissionReview(request, {
        ...body,
        expected_version: body.expected_version ?? targetSubmission.version,
      }, String(submission_id));
    }

    const assignWeight = assignment.weight ?? 0;
    const assignMax    = assignment.max_points ?? 100;
    const gradeResult = normalizeGradeValueWithMax(grade, assignMax);
    if ('grade' in body && gradeResult.error) {
      return NextResponse.json({ error: gradeResult.error, field: 'grade' }, { status: 400 });
    }
    if ('grade' in body && gradeResult.value === undefined) {
      return NextResponse.json({ error: 'grade must be a number or null', field: 'grade' }, { status: 400 });
    }
    const statusResult = normalizeSubmissionStatus(status);
    if ('status' in body && statusResult.error) {
      return NextResponse.json({ error: statusResult.error, field: 'status' }, { status: 400 });
    }
    const normalizedGrade = gradeResult.value;

    let existingSub: any = null;
    if (student_id) {
      const { data } = await admin
        .from('assignment_submissions')
        .select('id, assignment_id, file_url, grade, status, version')
        .eq('assignment_id', assignment_id)
        .eq('portal_user_id', student_id)
        .maybeSingle();
      existingSub = data;
    }

    if (student_id && caller.role !== 'admin') {
      const { data: targetStudent } = await admin
        .from('portal_users')
        .select('role, id, school_id, school_name, class_id, section_class, primary_teacher_id, enrollment_type')
        .eq('id', student_id)
        .maybeSingle();

      if (!targetStudent || targetStudent.role !== 'student') {
        return NextResponse.json({ error: 'student_id must point to a valid student account' }, { status: 400 });
      }

      const scope = await resolveStudentProgramScope(admin, student_id, targetStudent.class_id);
      const classTeacherId = await getStudentClassTeacherId(admin, targetStudent.class_id);
      const creatorRoles: Record<string, string> = {};
      if (assignment.created_by) {
        const { data: creatorUser } = await admin
          .from('portal_users')
          .select('role')
          .eq('id', assignment.created_by)
          .maybeSingle();
        if (creatorUser?.role) creatorRoles[assignment.created_by] = creatorUser.role;
      }

      if (!assignmentVisibleToStudent(assignment, targetStudent as unknown as AssignmentStudentScope, scope, creatorRoles, classTeacherId)) {
        return NextResponse.json({ error: 'Target student is not in this assignment audience' }, { status: 403 });
      }
    }

    if (student_id) {
      // Existing work always uses the optimistic-concurrency review command.
      if (existingSub?.id) {
        return forwardToCanonicalSubmissionReview(request, {
          ...body,
          expected_version: body.expected_version ?? existingSub.version,
        }, String(existingSub.id));
      }

      const now = new Date().toISOString();
      const insertTransition = buildAssignmentGradeTransition({
        currentGrade: existingSub?.grade ?? null,
        currentStatus: existingSub?.status ?? null,
        grade: 'grade' in body ? normalizedGrade ?? null : undefined,
        status: statusResult.value ?? 'graded',
        maxPoints: assignMax,
        weight: assignWeight,
        graderId: caller.id,
        now,
      });
      if (insertTransition.error) {
        return NextResponse.json({ error: insertTransition.error, field: 'grade' }, { status: 400 });
      }

      const insertPayload: any = {
        assignment_id,
        portal_user_id:  student_id,
        grade:           normalizedGrade ?? null,
        feedback:        feedback ?? null,
        status:          statusResult.value ?? 'graded',
        submission_text: submission_text ?? null,
        // Staff-entered/offline evidence is not a learner portal submission.
        submitted_at:    null,
        graded_by:       caller.id,
        graded_at:       now,
        grading_mode:    'manual',
        grading_details: { source: 'staff_recorded_without_portal_submission' },
        status_changed_by: caller.id,
        last_change_reason: typeof body.change_reason === 'string' && body.change_reason.trim()
          ? body.change_reason.trim().slice(0, 500)
          : 'Teacher recorded an offline or direct assessment mark',
        updated_at:      now,
      };
      Object.assign(insertPayload, insertTransition.fields);

      // Keep submitted files attached after grading so the grade remains auditable.

      const { data, error } = await admin
        .from('assignment_submissions')
        .insert(insertPayload)
        .select('id, grade, status, weighted_score, portal_user_id')
        .single();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({
            error: 'A review for this learner was created in another session. Refresh before recording the mark.',
            code: 'STALE_SUBMISSION_REVIEW',
          }, { status: 409 });
        }
        console.error('[assignment-grade] direct mark insert failed', { assignmentId: assignment_id, code: error.code });
        return NextResponse.json({ error: 'The mark could not be recorded safely. Nothing was changed; please retry.' }, { status: 500 });
      }

      // Write audit log (standard helper — keeps user_id in sync so the actor resolves)
      await logAudit(admin as any, {
        action: 'record_direct_assignment_grade',
        actorId: caller.id,
        resourceType: 'assignment_submission',
        resourceId: data.id,
        oldValue: String(existingSub?.grade ?? ''),
        newValue: `Recorded staff-entered score ${data.grade ?? '—'} without claiming a portal submission`,
        newValues: {
          grade: data.grade ?? null,
          weighted_score: data.weighted_score ?? null,
          source: 'staff_recorded_without_portal_submission',
        },
      });

      if (insertTransition.finalized && data?.portal_user_id) {
        sendGradeNotifications(
          admin, data.portal_user_id, assignment.title || 'Assignment',
          data.grade, assignMax, data.weighted_score, feedback,
        ).catch(console.error);
      }

      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'submission_id or student_id required' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
