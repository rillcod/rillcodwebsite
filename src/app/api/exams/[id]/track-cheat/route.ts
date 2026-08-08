import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { examTakingService } from '@/services/exam-taking.service';

const eventSchema = z.object({
  attemptId: z.string().uuid(),
  type: z.literal('tab_switch'),
}).strict();

async function postHandler(req: Request, ctx: ApiContext) {
  if (ctx.user?.role !== 'student') throw new AppError('Only students can record an exam event', 403);
  const examId = String(ctx.params?.id || '');
  if (!examId) throw new AppError('Exam ID missing', 400);
  const parsed = eventSchema.safeParse(await req.json());
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || 'Invalid exam event', 400);
  await examTakingService.recordTabSwitch(examId, parsed.data.attemptId, ctx.user.id);
  return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
