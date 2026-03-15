import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller;
}

// GET /api/cbt/exams/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data, error } = await adminClient()
    .from('cbt_exams')
    .select('*, programs(name), courses(title), cbt_questions(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  return NextResponse.json({ data });
}

// PATCH /api/cbt/exams/[id] — update exam + sync questions
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { questions, deletedQuestionIds = [], ...examFields } = body;

  const examPayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const allowedExamFields = ['title', 'description', 'program_id', 'course_id',
    'duration_minutes', 'passing_score', 'total_questions', 'is_active',
    'start_date', 'end_date'];
  for (const f of allowedExamFields) {
    if (f in examFields) examPayload[f] = examFields[f] ?? null;
  }

  const admin = adminClient();

  const { error: examErr } = await admin
    .from('cbt_exams')
    .update(examPayload)
    .eq('id', id);
  if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 });

  // Handle question sync if provided
  if (questions !== undefined) {
    // Delete removed questions
    if (deletedQuestionIds.length > 0) {
      await admin.from('cbt_questions').delete().in('id', deletedQuestionIds);
    }

    // Upsert questions (new ones have no id)
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
      await admin.from('cbt_questions').update({
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options ?? null,
        correct_answer: q.correct_answer,
        points: q.points ?? 5,
        order_index: q.order_index,
        metadata: q.metadata ?? null,
      }).eq('id', q.id);
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/cbt/exams/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await adminClient()
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { id } = await params;
    const { error } = await adminClient()
      .from('cbt_exams')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
