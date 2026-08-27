import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { programIdForCourse } from '@/lib/assignments/visibility';
import { callerCanManageAssignmentWork } from '@/lib/assignments/authz';
import {
  hasLearnerAssignmentEvidence,
  hasProtectedAssignmentScoreEvidence,
} from '@/lib/academic/record-retention';
import { logAudit } from '@/lib/audit/log';
import { isAutoGradableAssignmentQuestion } from '@/lib/assignments/grading';
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

const ALLOWED_GRADING_MODES = new Set(['manual', 'auto', 'ai_suggested']);

function validateAssignmentInput(body: Record<string, any>, partial = false): { error: string; field: string } | null {
  if ((!partial || 'title' in body) && typeof body.title !== 'string') {
    return { error: 'title is required', field: 'title' };
  }
  if ('title' in body) {
    body.title = String(body.title).trim();
    if (!body.title) return { error: 'title is required', field: 'title' };
  }
  if ('max_points' in body && body.max_points != null) {
    const maxPoints = Number(body.max_points);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { error: 'max_points must be a positive number', field: 'max_points' };
    }
    body.max_points = maxPoints;
  }
  if ('weight' in body && body.weight != null) {
    const weight = Number(body.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      return { error: 'weight must be between 0 and 100', field: 'weight' };
    }
    body.weight = weight;
  }
  if ('due_date' in body && body.due_date) {
    const dueDate = new Date(body.due_date);
    if (Number.isNaN(dueDate.getTime())) {
      return { error: 'due_date must be a valid date', field: 'due_date' };
    }
    body.due_date = dueDate.toISOString();
  }
  if ('grading_mode' in body && body.grading_mode && !ALLOWED_GRADING_MODES.has(String(body.grading_mode))) {
    return { error: 'grading_mode must be manual, auto, or ai_suggested', field: 'grading_mode' };
  }
  return null;
}

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

/** Returns true if caller can manage this assignment. Teachers: creator only. */
function callerCanManageAssignment(
  caller: Caller,
  _assignmentSchoolId: string | null,
  createdBy: string | null,
): boolean {
  if (caller.role === 'admin') return true;
  // Strict: a teacher can only edit/delete assignments they personally created.
  // Being at the same school is NOT sufficient — that would let Suleiman delete
  // Amaka's assignments and vice versa.
  if (caller.role === 'teacher') return createdBy === caller.id;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/[id]
// Staff only — returns full assignment with all submissions for grading.
// Students use /api/assignments/[id]/student instead.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  if (!['admin', 'teacher', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  const { data, error } = await admin
    .from('assignments')
    .select(`
      *, courses ( id, title, programs ( name ) ),
      assignment_submissions (
        id, status, grade, portal_user_id, version,
        submission_text, answers, file_url, attachments,
        submitted_at, graded_at, updated_at, feedback,
        weighted_score, grading_mode,
        ai_suggested_grade, ai_suggested_feedback,
        portal_users!assignment_submissions_portal_user_id_fkey ( full_name, email )
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  // School / class boundary — same rules as grade / submission manage
  if (caller.role !== 'admin') {
    const canAccess = await callerCanManageAssignmentWork(admin as any, caller, data as any);
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied: assignment is outside your class/school scope' }, { status: 403 });
    }
  }

  const submissions = Array.isArray((data as any).assignment_submissions)
    ? (data as any).assignment_submissions
    : [];
  const submissionIds = submissions.map((submission: any) => submission.id).filter(Boolean);
  if (submissionIds.length > 0) {
    const { data: details, error: detailsError } = await admin
      .from('assignment_submissions')
      .select('id, grading_details')
      .in('id', submissionIds);
    if (!detailsError) {
      const byId = new Map((details ?? []).map((detail) => [detail.id, detail.grading_details]));
      for (const submission of submissions) submission.grading_details = byId.get(submission.id) ?? null;
    } else if (!['42703', 'PGRST204'].includes(detailsError.code) && !/grading_details/i.test(detailsError.message)) {
      console.warn('[assignment-detail] rubric details were unavailable', { assignmentId: id, detailsError });
    }
  }

  return NextResponse.json({ data });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/assignments/[id] — update assignment
// Teachers: only if they created it OR are assigned to its school
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  if (!['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Not authorized to edit assignments' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();
  const { data: existing } = await admin
    .from('assignments')
    .select('created_by, school_id, title, is_active, term_id, class_id, course_id, program_id, metadata, lesson_plan_id, academic_offering_id, offering_period_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const canManage = await callerCanManageAssignment(caller, existing.school_id, existing.created_by);
  if (!canManage) {
    return NextResponse.json({ error: 'Not authorized: assignment belongs to a different school or teacher' }, { status: 403 });
  }

  const body = await request.json();
  const inputIssue = validateAssignmentInput(body, true);
  if (inputIssue) return NextResponse.json(inputIssue, { status: 400 });
  const existingLessonPlanId = existing.lesson_plan_id
    || (typeof (existing.metadata as any)?.lesson_plan_id === 'string'
      ? (existing.metadata as any).lesson_plan_id
      : null);
  if (existingLessonPlanId
    && typeof body.is_active === 'boolean'
    && body.is_active !== existing.is_active) {
    return NextResponse.json({
      error: 'This work belongs to a class teaching package. Release or hold the complete week from its class plan so students never receive only one part.',
      code: 'PACKAGE_RELEASE_MANAGED',
      lesson_plan_id: existingLessonPlanId,
    }, { status: 409 });
  }
  const requestedClassId = typeof body.class_id === 'string' && body.class_id
    ? body.class_id
    : null;
  const isClassRecovery = !existing.class_id && !!requestedClassId;

  const evidenceDefinitionFields = [
    'course_id', 'program_id', 'class_id', 'term_id', 'assignment_type',
    'questions', 'max_points', 'weight', 'grading_mode',
  ];
  if (evidenceDefinitionFields.some((field) => field in body && !(field === 'class_id' && isClassRecovery))) {
    const { data: scoredSubmissions, error: scoreLookupError } = await admin
      .from('assignment_submissions')
      .select('grade,weighted_score,graded_at,graded_by,grading_mode,status')
      .eq('assignment_id', id)
      .limit(500);
    if (scoreLookupError) return NextResponse.json({ error: scoreLookupError.message }, { status: 500 });
    if ((scoredSubmissions ?? []).some(hasProtectedAssignmentScoreEvidence)) {
      return NextResponse.json({
        error: 'This assignment already contains graded evidence. Its scoring, questions and academic placement are locked; create a replacement assignment instead.',
        code: 'PROTECTED_ACADEMIC_EVIDENCE',
      }, { status: 409 });
    }
  }

  const allowed: Record<string, unknown> = {};
  const allowedFields = [
    'title', 'description', 'instructions', 'course_id', 'program_id',
    'due_date', 'max_points', 'assignment_type', 'is_active', 'questions', 'metadata',
    'class_id', 'weight', 'grading_mode', 'term_id',
  ];
  for (const f of allowedFields) {
    if (f in body) allowed[f] = body[f] ?? null;
  }
  if (!allowed.grading_mode && Array.isArray(allowed.questions) && allowed.questions.length > 0) {
    allowed.grading_mode = allowed.questions.every(isAutoGradableAssignmentQuestion)
      ? 'auto'
      : 'manual';
  }

  // Keep programme scope consistent with the course: when the course changes but no
  // explicit programme was sent, re-derive program_id from the (new) course.
  if ('course_id' in allowed && !('program_id' in body)) {
    allowed.program_id = await programIdForCourse(admin, allowed.course_id as string | null);
  }
  const targetClassId = (body.metadata as any)?.target_class_id || body.class_id || existing.class_id;
  if (!('term_id' in body) && !existing.term_id) {
    const { resolveAssignmentTermId, loadTeachingPeriodFromClass } = await import('@/lib/assignments/session');
    const period = await loadTeachingPeriodFromClass(admin, targetClassId ?? null, {
      class_id: targetClassId ?? null,
      school_id: existing.school_id ?? null,
      academic_offering_id: existing.academic_offering_id ?? null,
      offering_period_id: existing.offering_period_id ?? null,
      term_id: existing.term_id ?? null,
    });
    allowed.term_id = await resolveAssignmentTermId(admin, {
      classId: targetClassId ?? null,
      period,
    });
  }
  if (targetClassId) {
    const { data: targetClass } = await admin
      .from('classes')
      .select('id,teacher_id,school_id,program_id,term_id,academic_offering_id,offering_period_id')
      .eq('id', targetClassId)
      .maybeSingle();
    if (!targetClass) return NextResponse.json({ error: 'Target class not found' }, { status: 400 });
    if (caller.role === 'teacher' && targetClass.teacher_id !== caller.id) {
      return NextResponse.json({ error: 'You can only target classes you own' }, { status: 403 });
    }
    if (existing.school_id && targetClass?.school_id && targetClass.school_id !== existing.school_id) {
      return NextResponse.json({ error: 'Target class belongs to a different school' }, { status: 403 });
    }
    if (isClassRecovery) {
      if (existing.program_id && targetClass.program_id && existing.program_id !== targetClass.program_id) {
        return NextResponse.json({
          error: 'The selected class belongs to a different programme. Choose the matching class.',
          code: 'CLASS_CONTEXT_MISMATCH',
        }, { status: 409 });
      }
      if (existing.term_id && targetClass.term_id && existing.term_id !== targetClass.term_id) {
        return NextResponse.json({
          error: 'The selected class is in a different academic term.',
          code: 'CLASS_CONTEXT_MISMATCH',
        }, { status: 409 });
      }
      if (!existing.course_id) {
        return NextResponse.json({
          error: 'Choose a course before linking this assignment to class results.',
          code: 'COURSE_REQUIRED_FOR_RESULT',
        }, { status: 409 });
      }
      if (!targetClass.academic_offering_id || !targetClass.offering_period_id) {
        return NextResponse.json({
          error: 'Repair the class academic offering and period before linking result evidence.',
          code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE',
        }, { status: 409 });
      }
      allowed.class_id = targetClass.id;
      allowed.school_id = targetClass.school_id;
      allowed.term_id = existing.term_id || targetClass.term_id;
      allowed.academic_offering_id = targetClass.academic_offering_id;
      allowed.offering_period_id = targetClass.offering_period_id;
      allowed.metadata = {
        ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        target_class_id: targetClass.id,
        visibility: 'class',
        assessment_scope: 'class_result',
        result_eligible: true,
      };
    }
  }
  allowed.updated_at = new Date().toISOString();

  const { error } = await admin.from('assignments').update(allowed).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notificationResult: Awaited<ReturnType<
    typeof import('@/lib/assignments/notifications')['triggerAssignmentReleaseNotifications']
  >> | null = null;
  if (allowed.is_active === true && existing.is_active !== true) {
    const { triggerAssignmentReleaseNotifications } = await import('@/lib/assignments/notifications');
    notificationResult = await triggerAssignmentReleaseNotifications(id, caller.id);
  }

  await logAudit(admin as any, {
    action: allowed.is_active === true && existing.is_active !== true
      ? 'publish_assignment'
      : allowed.is_active === false && existing.is_active === true
        ? 'deactivate_assignment'
        : 'update_assignment',
    actorId: caller.id,
    resourceType: 'assignment',
    resourceId: id,
    oldValue: existing.title ?? null,
    newValue: typeof allowed.title === 'string' ? allowed.title : existing.title ?? null,
    oldValues: { is_active: existing.is_active },
    newValues: {
      changed_fields: Object.keys(allowed).filter((field) => field !== 'updated_at'),
      is_active: 'is_active' in allowed ? allowed.is_active : existing.is_active,
    },
  });

  return NextResponse.json({
    success: true,
    ...(notificationResult ? { notification: notificationResult } : {}),
    ...(notificationResult?.status === 'failed'
      ? {
          warning: 'The assignment is visible to students, but one or more alerts were not sent. An administrator can resend them from Office.',
        }
      : {}),
  });
}

// PUT is an alias for PATCH
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(request, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/assignments/[id]
// Teachers: only if they created it OR are assigned to its school
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  if (!['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Not authorized to delete assignments' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  const { data: existing } = await admin
    .from('assignments')
    .select('created_by, school_id, title, is_active')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const canManage = await callerCanManageAssignment(caller, existing.school_id, existing.created_by);
  if (!canManage) {
    return NextResponse.json({ error: 'Not authorized: assignment belongs to a different school or teacher' }, { status: 403 });
  }

  const { data: scoredSubmissions, error: scoreLookupError } = await admin
    .from('assignment_submissions')
    .select('id,submission_text,file_url,submitted_at,answers,grade,weighted_score,graded_at,graded_by,grading_mode,status')
    .eq('assignment_id', id)
    .limit(500);
  if (scoreLookupError) return NextResponse.json({ error: scoreLookupError.message }, { status: 500 });
  if ((scoredSubmissions ?? []).some(hasLearnerAssignmentEvidence)) {
    return NextResponse.json({
      error: 'This assignment contains learner submissions and cannot be deleted. Deactivate it instead; submitted work and scores stay protected.',
      code: 'PROTECTED_ACADEMIC_EVIDENCE',
    }, { status: 409 });
  }

  const cleanupPolicy = await loadCleanupPolicy(admin as any);
  if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
    return NextResponse.json({ error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' }, { status: 409 });
  }

  // Only unused drafts can reach this point. Learner work and scores are retained above.
  await admin.from('assignment_submissions').delete().eq('assignment_id', id);

  const { error } = await admin.from('assignments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(admin as any, {
    action: 'delete_ungraded_assignment_draft',
    actorId: caller.id,
    resourceType: 'assignment',
    resourceId: id,
    oldValue: existing.title ?? null,
    oldValues: { title: existing.title, is_active: existing.is_active },
  });
  return NextResponse.json({ success: true });
}
