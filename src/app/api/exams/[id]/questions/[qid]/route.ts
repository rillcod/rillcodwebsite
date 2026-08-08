import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit/log';
import { z } from 'zod';

const questionPatchSchema = z.object({
  question_text: z.string().trim().min(1).max(10_000).optional(),
  question_type: z.enum(['multiple_choice', 'true_false', 'short_answer', 'essay', 'matching', 'fill_in_blank']).optional(),
  points: z.number().min(0).max(1000).optional(),
  options: z.array(z.string().max(1000)).max(20).nullable().optional(),
  correct_answer: z.union([z.string().max(5000), z.number(), z.null()]).optional(),
  explanation: z.string().max(5000).nullable().optional(),
  order_index: z.number().int().min(1).max(10_000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Supply at least one question field.');

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
  return data?.is_active && !data.is_deleted ? { ...user, role: data.role, school_id: (data as any).school_id ?? null } : null;
}

async function canManageExam(user: any, examId: string) {
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string; qid: string }> }) {
  const user = await getUser();
  if (!user || !['admin', 'teacher'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id, qid } = await context.params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createAdminClient();
  if (await examHasAttempts(db, exam_id)) {
    return NextResponse.json({ error: 'This exam already has learner attempts. Its question definition is now locked.' }, { status: 409 });
  }
  const parsed = questionPatchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid question update' }, { status: 400 });
  const { data: before, error: beforeError } = await db.from('exam_questions').select('*').eq('id', qid).eq('exam_id', exam_id).maybeSingle();
  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const { data, error } = await db.from('exam_questions')
    .update(parsed.data as any)
    .eq('id', qid)
    .eq('exam_id', exam_id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(db as any, {
    action: 'update_written_exam_question', actorId: user.id,
    resourceType: 'exam_question', resourceId: qid,
    tableName: 'exam_questions', oldValues: before, newValues: parsed.data,
  });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; qid: string }> }) {
  const user = await getUser();
  if (!user || !['admin', 'teacher'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id, qid } = await context.params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createAdminClient();
  if (await examHasAttempts(db, exam_id)) {
    return NextResponse.json({ error: 'This exam already has learner attempts. Its question definition is now locked.' }, { status: 409 });
  }
  const { data: before, error: beforeError } = await db.from('exam_questions').select('id,question_type,points,order_index').eq('id', qid).eq('exam_id', exam_id).maybeSingle();
  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const { error } = await db.from('exam_questions').delete().eq('id', qid).eq('exam_id', exam_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(db as any, {
    action: 'delete_unattempted_written_exam_question', actorId: user.id,
    resourceType: 'exam_question', resourceId: qid,
    tableName: 'exam_questions', oldValues: { ...before, exam_id },
    newValue: 'Deleted question before any learner attempted the exam',
  });
  return NextResponse.json({ success: true });
}
