import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { gradingService } from '@/services/grading.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const { attemptId, answers } = await req.json();
    if (!attemptId) throw new AppError('Attempt ID missing', 400);

    const result = await gradingService.submitExam(attemptId, ctx.user!.id, answers);
    return NextResponse.json({ success: true, data: result });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
