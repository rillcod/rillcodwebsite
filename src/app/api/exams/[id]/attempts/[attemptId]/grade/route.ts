import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { applyManualWrittenGrade } from '@/lib/exams/manual-grade-action';

async function postHandler(req: Request, ctx: ApiContext) {
  const examId = ctx.params?.id;
  const attemptId = ctx.params?.attemptId;
  if (!examId || !attemptId) throw new AppError('Exam and attempt IDs are required', 400);
  if (!ctx.user) throw new AppError('Unauthorized', 401);
  const result = await applyManualWrittenGrade(ctx.user, examId, attemptId, await req.json());
  return NextResponse.json({ success: true, ...result });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
