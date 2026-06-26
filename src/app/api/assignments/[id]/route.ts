import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { programIdForCourse } from '@/lib/assignments/visibility';

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

async function teacherOwnsClass(admin: ReturnType<typeof adminClient>, teacherId: string, classId: string | null): Promise<boolean> {
  if (!classId) return false;
  const { data } = await admin
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .maybeSingle();
  return data?.teacher_id === teacherId;
}

async function teacherAssignedToSchool(admin: ReturnType<typeof adminClient>, teacherId: string, primarySchoolId: string | null, schoolId: string | null): Promise<boolean> {
  if (!schoolId) return false;
  if (primarySchoolId === schoolId) return true;
  const { data } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .maybeSingle();
  return !!data;
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
        id, status, grade, portal_user_id,
        submission_text, answers, file_url,
        submitted_at, graded_at, feedback,
        portal_users!assignment_submissions_portal_user_id_fkey ( full_name, email )
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  // School boundary check
  if (caller.role === 'school' && (!caller.school_id || (data as any).school_id !== caller.school_id)) {
    return NextResponse.json({ error: 'Access denied: assignment is outside your school scope' }, { status: 403 });
  }
  if (caller.role === 'teacher') {
    const targetClassId = (data as any).metadata?.target_class_id || (data as any).class_id || null;
    const canAccess =
      (data as any).created_by === caller.id ||
      await teacherOwnsClass(admin, caller.id, targetClassId) ||
      (!targetClassId && await teacherAssignedToSchool(admin, caller.id, caller.school_id, (data as any).school_id));
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied: assignment is outside your school scope' }, { status: 403 });
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
    .select('created_by, school_id, is_active')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const canManage = await callerCanManageAssignment(caller, existing.school_id, existing.created_by);
  if (!canManage) {
    return NextResponse.json({ error: 'Not authorized: assignment belongs to a different school or teacher' }, { status: 403 });
  }

  const body = await request.json();
  const allowed: Record<string, unknown> = {};
  const allowedFields = [
    'title', 'description', 'instructions', 'course_id', 'program_id',
    'due_date', 'max_points', 'assignment_type', 'is_active', 'questions', 'metadata',
    'class_id', 'weight', 'grading_mode',
  ];
  for (const f of allowedFields) {
    if (f in body) allowed[f] = body[f] ?? null;
  }
  if (!allowed.grading_mode && Array.isArray(allowed.questions) && allowed.questions.length > 0) {
    const autoTypes = new Set(['multiple_choice', 'true_false', 'coding_blocks']);
    const autoGradeable = allowed.questions.every((q: any) => (
      autoTypes.has(String(q.question_type ?? '').toLowerCase())
      && String(q.correct_answer ?? '').trim()
    ));
    if (autoGradeable) allowed.grading_mode = 'auto';
  }

  // Keep programme scope consistent with the course: when the course changes but no
  // explicit programme was sent, re-derive program_id from the (new) course.
  if ('course_id' in allowed && !('program_id' in body)) {
    allowed.program_id = await programIdForCourse(admin, allowed.course_id as string | null);
  }
  const targetClassId = (body.metadata as any)?.target_class_id || body.class_id;
  if (caller.role === 'teacher' && targetClassId) {
    const ownsClass = await teacherOwnsClass(admin, caller.id, targetClassId);
    if (!ownsClass) {
      return NextResponse.json({ error: 'You can only target classes you own' }, { status: 403 });
    }
    const { data: targetClass } = await admin
      .from('classes')
      .select('school_id')
      .eq('id', targetClassId)
      .maybeSingle();
    if (existing.school_id && targetClass?.school_id && targetClass.school_id !== existing.school_id) {
      return NextResponse.json({ error: 'Target class belongs to a different school' }, { status: 403 });
    }
  }
  allowed.updated_at = new Date().toISOString();

  const { error } = await admin.from('assignments').update(allowed).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (allowed.is_active === true && existing.is_active !== true) {
    const { triggerAssignmentReleaseNotifications } = await import('@/lib/assignments/notifications');
    triggerAssignmentReleaseNotifications(id, caller.id).catch(console.error);
  }

  return NextResponse.json({ success: true });
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
    .select('created_by, school_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const canManage = await callerCanManageAssignment(caller, existing.school_id, existing.created_by);
  if (!canManage) {
    return NextResponse.json({ error: 'Not authorized: assignment belongs to a different school or teacher' }, { status: 403 });
  }

  // Delete submissions first to avoid FK violations if no CASCADE is set
  await admin.from('assignment_submissions').delete().eq('assignment_id', id);

  const { error } = await admin.from('assignments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
