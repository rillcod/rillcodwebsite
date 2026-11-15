import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit/log';
import { requireSupabaseWrite } from '@/lib/supabase/require-result';
import { z } from 'zod';
import { writtenQuestionDefinitionError } from '@/lib/exams/question-validation';

const questionSchema = z.object({
  question_text: z.string().trim().min(1).max(10_000),
  question_type: z.enum(['multiple_choice', 'true_false', 'short_answer', 'essay', 'matching', 'fill_in_blank']).default('multiple_choice'),
  points: z.number().min(0).max(1000).default(1),
  options: z.array(z.string().trim().min(1).max(1000)).max(20).nullable().optional(),
  correct_answer: z.union([z.string().max(5000), z.number(), z.null()]).optional(),
  explanation: z.string().max(5000).nullable().optional(),
}).strict();

async function examHasAttempts(db: ReturnType<typeof createAdminClient>, examId: string) {
  const { count, error } = await db.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('exam_id', examId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id, is_active, is_deleted').eq('id', user.id).single();
  return data?.is_active && !data.is_deleted ? { ...user, role: data.role, school_id: data.school_id } : null;
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
  return false;
}

// GET /api/exams/[id]/questions
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = createAdminClient();
  // A learner only receives the sanitized paper from the attempt-start endpoint.
  if (user.role === 'student') return NextResponse.json({ error: 'Start the exam to access its questions.' }, { status: 403 });
  let allowed = await canManageExam(user as any, id);
  if (!allowed && user.role === 'school' && user.school_id) {
    const { data: scopedExam } = await db
      .from('exams')
      .select('courses!course_id(school_id)')
      .eq('id', id)
      .maybeSingle();
    allowed = (scopedExam as any)?.courses?.school_id === user.school_id;
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await db
    .from('exam_questions')
    .select('*')
    .eq('exam_id', id)
    .order('order_index', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/exams/[id]/questions — add a question or batch ({ questions: [...] })
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !['admin', 'teacher'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id } = await context.params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createAdminClient();
  if (await examHasAttempts(db, exam_id)) {
    return NextResponse.json({ error: 'This exam already has learner attempts. Its question definition is now locked.' }, { status: 409 });
  }

  const rawBody = await request.json();

  // Get next order_index
  const { data: existing } = await db.from('exam_questions').select('order_index').eq('exam_id', exam_id).order('order_index', { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.order_index ?? 0) + 1;

  if (rawBody && typeof rawBody === 'object' && Array.isArray((rawBody as any).questions)) {
    const batchSchema = z.object({
      questions: z.array(questionSchema).min(1).max(100),
    }).strict();
    const parsedBatch = batchSchema.safeParse(rawBody);
    if (!parsedBatch.success) {
      return NextResponse.json({ error: parsedBatch.error.issues[0]?.message || 'Invalid question batch' }, { status: 400 });
    }
    for (let i = 0; i < parsedBatch.data.questions.length; i++) {
      const q = parsedBatch.data.questions[i];
      const defErr = writtenQuestionDefinitionError({
        id: `batch-${i}`,
        question_type: q.question_type,
        points: q.points,
        options: q.options,
        correct_answer: q.correct_answer,
      });
      if (defErr) return NextResponse.json({ error: `Question #${i + 1}: ${defErr}` }, { status: 400 });
    }

    const rowsToInsert = parsedBatch.data.questions.map((q, idx) => ({
      exam_id,
      question_text: q.question_text,
      question_type: q.question_type || 'multiple_choice',
      points: q.points || 1,
      options: q.options || null,
      correct_answer: q.correct_answer !== undefined && q.correct_answer !== '' ? String(q.correct_answer) : null,
      explanation: q.explanation || null,
      order_index: nextOrder + idx,
    }));

    const { data: insertedRows, error: batchErr } = await db
      .from('exam_questions')
      .insert(rowsToInsert)
      .select();

    if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
    await logAudit(db as any, {
      action: 'batch_add_written_exam_questions',
      actorId: user.id,
      resourceType: 'exam',
      resourceId: exam_id,
      tableName: 'exam_questions',
      newValues: { exam_id, count: rowsToInsert.length },
    });
    return NextResponse.json({ data: insertedRows ?? [] }, { status: 201 });
  }

  const parsed = questionSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid question' }, { status: 400 });
  const { question_text, question_type, points, options, correct_answer, explanation } = parsed.data;
  const definitionError = writtenQuestionDefinitionError({ id: 'new', question_type, points, options, correct_answer });
  if (definitionError) return NextResponse.json({ error: definitionError }, { status: 400 });

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
  await logAudit(db as any, {
    action: 'add_written_exam_question', actorId: user.id,
    resourceType: 'exam_question', resourceId: data.id,
    tableName: 'exam_questions',
    newValues: { exam_id, question_type: data.question_type, points: data.points, order_index: data.order_index },
  });
  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/exams/[id]/questions — reorder questions (bulk update order)
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !['admin', 'teacher'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id } = await context.params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createAdminClient();
  if (await examHasAttempts(db, exam_id)) {
    return NextResponse.json({ error: 'This exam already has learner attempts. Its question definition is now locked.' }, { status: 409 });
  }
  const parsed = z.object({ questions: z.array(z.object({
    id: z.string().uuid(), order_index: z.number().int().min(1).max(10_000),
  }).strict()).min(1).max(1000) }).strict().safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'questions array required' }, { status: 400 });
  const questions = parsed.data.questions;
  if (new Set(questions.map((question) => question.id)).size !== questions.length) {
    return NextResponse.json({ error: 'Each question may appear only once.' }, { status: 400 });
  }
  const { count, error: scopeError } = await db.from('exam_questions').select('id', { count: 'exact', head: true }).eq('exam_id', exam_id).in('id', questions.map((question) => question.id));
  if (scopeError) return NextResponse.json({ error: scopeError.message }, { status: 500 });
  if ((count ?? 0) !== questions.length) return NextResponse.json({ error: 'One or more questions do not belong to this exam.' }, { status: 400 });
  const updates = questions.map((q: { id: string; order_index: number }) =>
    requireSupabaseWrite(
      db.from('exam_questions').update({ order_index: q.order_index } as any).eq('id', q.id).eq('exam_id', exam_id),
      `Reorder written exam question ${q.id}`,
    )
  );

  try {
    await Promise.all(updates);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  await logAudit(db as any, {
    action: 'reorder_written_exam_questions', actorId: user.id,
    resourceType: 'exam', resourceId: exam_id,
    newValues: { question_order: questions },
  });
  return NextResponse.json({ success: true });
}
