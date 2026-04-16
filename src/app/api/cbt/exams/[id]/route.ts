import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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

/** Returns true if the caller can manage (write) an exam at the given school. */
async function callerCanManageExam(caller: Caller, examSchoolId: string | null, examCreatedBy: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role !== 'teacher') return false;

  // Teacher can always manage exams they personally created
  if (examCreatedBy === caller.id) return true;

  // Or if they're assigned to the exam's school
  if (!examSchoolId) return false;
  if (caller.school_id === examSchoolId) return true;

  const { data: ts } = await adminClient()
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id)
    .eq('school_id', examSchoolId)
    .maybeSingle();
  return !!ts;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cbt/exams/[id]
// Staff: full exam with correct answers. Students: questions without answers.
// Students can only access active exams from their enrolled programs.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = adminClient();
  const isStaff = ['admin', 'teacher', 'school'].includes(caller.role);

  // Fetch exam metadata first for access checks
  const { data: examMeta, error: metaErr } = await admin
    .from('cbt_exams')
    .select('id, is_active, start_date, end_date, program_id, school_id, created_by')
    .eq('id', id)
    .maybeSingle();

  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
  if (!examMeta) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

  if (!isStaff) {
    // ── Student access: exam must be active and within date window ───────────
    const now = new Date().toISOString();
    if (!examMeta.is_active) {
      return NextResponse.json({ error: 'This exam is not currently active' }, { status: 403 });
    }
    if (examMeta.start_date && examMeta.start_date > now) {
      return NextResponse.json({ error: 'This exam has not started yet' }, { status: 403 });
    }
    if (examMeta.end_date && examMeta.end_date < now) {
      return NextResponse.json({ error: 'This exam has ended' }, { status: 403 });
    }

    // Verify student is enrolled in the exam's program (if scoped)
    if (examMeta.program_id) {
      const { data: enr } = await admin
        .from('enrollments')
        .select('id')
        .eq('user_id', caller.id)
        .eq('program_id', examMeta.program_id)
        .in('status', ['active', 'enrolled', 'approved'])
        .maybeSingle();
      if (!enr) {
        return NextResponse.json({ error: 'You are not enrolled in the program this exam belongs to' }, { status: 403 });
      }
    }
  }

  // Staff school-boundary check
  if (caller.role === 'school' && examMeta.school_id && examMeta.school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Access denied: exam is outside your school scope' }, { status: 403 });
  }
  if (caller.role === 'teacher') {
    const canAccess = await callerCanManageExam(caller, examMeta.school_id, examMeta.created_by);
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied: exam is outside your school scope' }, { status: 403 });
    }
  }

  // Students must NOT receive correct_answer
  const questionsSelect = isStaff
    ? 'cbt_questions(*)'
    : 'cbt_questions(id, question_text, question_type, options, points, order_index)';

  const { data, error } = await admin
    .from('cbt_exams')
    .select(`*, programs(name), courses(title), ${questionsSelect}`)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  return NextResponse.json({ data });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/cbt/exams/[id] — update exam + sync questions
// Teacher: can only edit exams they created OR at their assigned school(s)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const { id } = await params;
  const admin = adminClient();

  // Fetch exam to validate access
  const { data: examMeta } = await admin
    .from('cbt_exams')
    .select('school_id, created_by')
    .eq('id', id)
    .maybeSingle();

  if (!examMeta) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

  const canManage = await callerCanManageExam(caller, examMeta.school_id, examMeta.created_by);
  if (!canManage) {
    return NextResponse.json({ error: 'Access denied: you did not create this exam and are not assigned to its school' }, { status: 403 });
  }

  const body = await request.json();
  const { questions, deletedQuestionIds = [], ...examFields } = body;

  const examPayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const allowedExamFields = [
    'title', 'description', 'program_id', 'course_id',
    'duration_minutes', 'passing_score', 'total_questions', 'is_active',
    'start_date', 'end_date',
  ];
  for (const f of allowedExamFields) {
    if (f in examFields) examPayload[f] = examFields[f] ?? null;
  }

  const { error: examErr } = await admin.from('cbt_exams').update(examPayload).eq('id', id);
  if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 });

  // Sync questions if provided
  if (questions !== undefined) {
    if (deletedQuestionIds.length > 0) {
      // Scope delete to this exam only — prevent deleting another exam's questions
      await admin.from('cbt_questions').delete().in('id', deletedQuestionIds).eq('exam_id', id);
    }

    const newQs = questions.filter((q: any) => !q.id);
    const existingQs = questions.filter((q: any) => q.id);

    if (newQs.length > 0) {
      const qPayloads = newQs.map((q: any, i: number) => ({
        exam_id: id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options ?? null,
        correct_answer: q.correct_answer,
        points: q.points ?? 5,
        order_index: q.order_index ?? i + 1,
        metadata: q.metadata ?? null,
      }));
      const { error: newQErr } = await admin.from('cbt_questions').insert(qPayloads);
      if (newQErr) return NextResponse.json({ error: newQErr.message }, { status: 500 });
    }

    for (const q of existingQs) {
      // Scope update to this exam only — prevent editing another exam's question by ID
      const { error: uErr } = await admin
        .from('cbt_questions')
        .update({
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options ?? null,
          correct_answer: q.correct_answer,
          points: q.points ?? 5,
          order_index: q.order_index,
          metadata: q.metadata ?? null,
        })
        .eq('id', q.id)
        .eq('exam_id', id); // safety: only update questions owned by this exam
      if (uErr) return NextResponse.json({ error: `Failed to update question: ${uErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/cbt/exams/[id]
// Teacher: can only delete exams they created OR at their assigned school(s)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { id } = await params;
    const admin = adminClient();

    const { data: examMeta } = await admin
      .from('cbt_exams')
      .select('school_id, created_by')
      .eq('id', id)
      .maybeSingle();

    if (!examMeta) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

    const canManage = await callerCanManageExam(caller, examMeta.school_id, examMeta.created_by);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: you did not create this exam and are not assigned to its school' }, { status: 403 });
    }

    const { error } = await admin.from('cbt_exams').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
