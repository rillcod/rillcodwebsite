import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError, NotFoundError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyManualWrittenGrade } from '@/lib/exams/manual-grade-action';

/** Compatibility endpoint. New clients use /api/exams/:examId/attempts/:attemptId/grade. */
async function postHandler(req: Request, ctx: ApiContext) {
  const attemptId = ctx.params?.id;
  if (!attemptId) throw new AppError('Attempt ID missing', 400);
  if (!ctx.user) throw new AppError('Unauthorized', 401);
  const db = createAdminClient();
  const { data: attempt, error } = await db.from('exam_attempts').select('exam_id').eq('id', attemptId).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  if (!attempt?.exam_id) throw new NotFoundError('Exam attempt not found');
  const result = await applyManualWrittenGrade(ctx.user, attempt.exam_id, attemptId, await req.json());
  return NextResponse.json({ success: true, ...result });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
