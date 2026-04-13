import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

async function getTeacherSchoolIds(teacherId: string, fallbackSchoolId: string | null) {
  const db = createAdminClient();
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const { data } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

async function canManageExam(user: Awaited<ReturnType<typeof getUser>>, examId: string) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const db = createAdminClient();
  const { data: exam } = await db
    .from('exams')
    .select('id, created_by, course_id, courses!course_id(school_id)')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return false;
  const courseSchoolId = (exam as any)?.courses?.school_id as string | null;
  if (user.role === 'teacher') {
    if ((exam as any).created_by === user.id) return true;
    const schoolIds = await getTeacherSchoolIds(user.id, user.school_id ?? null);
    return !!courseSchoolId && schoolIds.includes(courseSchoolId);
  }
  if (user.role === 'school') {
    return !!user.school_id && !!courseSchoolId && user.school_id === courseSchoolId;
  }
  return false;
}

// GET /api/exams/[id]/questions
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const allowed = await canManageExam(user as any, id);
  if (!allowed && user.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createAdminClient();

  const { data, error } = await db
    .from('exam_questions')
    .select('*')
    .eq('exam_id', id)
    .order('order_index', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/exams/[id]/questions — add a question
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id } = await params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  const { question_text, question_type, points, options, correct_answer, explanation } = body;

  if (!question_text) return NextResponse.json({ error: 'question_text required' }, { status: 400 });

  const db = createAdminClient();

  // Get next order_index
  const { data: existing } = await db.from('exam_questions').select('order_index').eq('exam_id', exam_id).order('order_index', { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.order_index ?? 0) + 1;

  const { data, error } = await db.from('exam_questions').insert([{
    exam_id,
    question_text,
    question_type: question_type || 'multiple_choice',
    points: points || 1,
    options: options || null,
    correct_answer: correct_answer || null,
    explanation: explanation || null,
    order_index: nextOrder,
  }]).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/exams/[id]/questions — reorder questions (bulk update order)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id } = await params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { questions } = await request.json(); // Array of { id, order_index }

  if (!Array.isArray(questions)) return NextResponse.json({ error: 'questions array required' }, { status: 400 });

  const db = createAdminClient();
  const updates = questions.map((q: { id: string; order_index: number }) =>
    db.from('exam_questions').update({ order_index: q.order_index } as any).eq('id', q.id).eq('exam_id', exam_id)
  );

  await Promise.all(updates);
  return NextResponse.json({ success: true });
}
