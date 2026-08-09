import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError, NotFoundError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { canReadWrittenExam } from '@/lib/exams/access';
import { readWrittenGradingMetadata, stripWrittenGradingMetadata } from '@/lib/exams/written-grading';

async function getHandler(_req: Request, ctx: ApiContext) {
  const examId = ctx.params?.id;
  const attemptId = ctx.params?.attemptId;
  if (!examId || !attemptId) throw new AppError('Exam and attempt IDs are required', 400);
  if (!ctx.user) throw new AppError('Unauthorized', 401);

  const db = createAdminClient();
  const { data: attempt, error } = await db
    .from('exam_attempts')
    .select('*,exams(id,title,passing_score)')
    .eq('id', attemptId)
    .eq('exam_id', examId)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  if (!attempt) throw new NotFoundError('Exam attempt not found');
  if (ctx.user.role === 'student') {
    if (attempt.portal_user_id !== ctx.user.id) throw new AppError('Forbidden', 403);
  } else if (!(await canReadWrittenExam(ctx.user, examId))) {
    throw new AppError('Forbidden', 403);
  }

  const metadata = readWrittenGradingMetadata(attempt.answers);
  if (ctx.user.role === 'student') {
    return NextResponse.json({
      success: true,
      data: {
        id: attempt.id,
        exam_id: attempt.exam_id,
        attempt_number: attempt.attempt_number,
        status: attempt.status,
        score: attempt.status === 'graded' ? attempt.score : null,
        total_points: attempt.total_points,
        percentage: attempt.status === 'graded' ? attempt.percentage : null,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
        feedback: attempt.status === 'graded' ? metadata.feedback : null,
        exam: (attempt as any).exams,
      },
    });
  }

  const [{ data: questions, error: questionError }, { data: student, error: studentError }] = await Promise.all([
    db.from('exam_questions').select('*').eq('exam_id', examId).order('order_index', { ascending: true }),
    attempt.portal_user_id
      ? db.from('portal_users').select('id,full_name,email').eq('id', attempt.portal_user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (questionError) throw new AppError(questionError.message, 500);
  if (studentError) throw new AppError(studentError.message, 500);
  return NextResponse.json({
    success: true,
    data: {
      ...attempt,
      answers: stripWrittenGradingMetadata(attempt.answers),
      grading: metadata,
      questions: questions ?? [],
      student,
      exam: (attempt as any).exams,
    },
  });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
