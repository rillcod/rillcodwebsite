import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';

const patchQuestionSchema = z.object({
    action: z.enum(['upvote', 'answer']),
    answer: z.string().optional(),
});

// PATCH — manage a question
async function patchHandler(req: Request, ctx: ApiContext) {
    const qid = ctx.params?.qid;
    if (!qid) throw new AppError('Question ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, patchQuestionSchema);
    if (errorResponse) return errorResponse;

    if (data!.action === 'upvote') {
        await liveSessionService.upvoteQuestion(qid);
        return NextResponse.json({ success: true, message: 'Upvoted' });
    }

    if (data!.action === 'answer') {
        if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
        if (!ctx.user?.id) throw new AppError('Unauthorized', 401);
        if (!data!.answer) throw new AppError('Answer body required', 400);

        const question = await liveSessionService.answerQuestion(
            qid,
            data!.answer,
            ctx.user.id
        );
        return NextResponse.json({ success: true, data: question });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
}

// DELETE — remove a question
async function deleteHandler(req: Request, ctx: ApiContext) {
    const qid = ctx.params?.qid;
    if (!qid) throw new AppError('Question ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    await liveSessionService.deleteQuestion(qid, ctx.user.id, ctx.user.role);
    return NextResponse.json({ success: true });
}

export const PATCH  = (req: any, ctx: any) => withApiProxy(patchHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
