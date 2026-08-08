import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { examTakingService } from '@/services/exam-taking.service';

const saveSchema = z.object({
  attemptId: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()),
}).strict();

async function postHandler(req: Request, ctx: ApiContext) {
  if (ctx.user?.role !== 'student') throw new AppError('Only students can save exam progress', 403);
  const examId = String(ctx.params?.id || '');
  if (!examId) throw new AppError('Exam ID missing', 400);
  const parsed = saveSchema.safeParse(await req.json());
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || 'Invalid autosave payload', 400);
  await examTakingService.saveProgress(examId, parsed.data.attemptId, ctx.user.id, parsed.data.answers as any);
  return NextResponse.json({ success: true, saved_at: new Date().toISOString() });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
