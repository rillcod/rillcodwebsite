import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { gradingService } from '@/services/grading.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id; // attemptId
    if (!id) throw new AppError('Attempt ID missing', 400);

    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

    const { scores, feedback } = await req.json();
    const result = await gradingService.manualGrade(id, scores, feedback);

    return NextResponse.json({ success: true, message: 'Grading updated and student notified' });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
