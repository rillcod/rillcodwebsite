import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';

const patchQuestionSchema = z.object({
    answer: z.string().optional(),
    upvote: z.boolean().optional(),
});

async function patchHandler(req: Request, ctx: ApiContext) {
    const questionId = ctx.params?.questionId;
    if (!questionId) throw new AppError('Question ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, patchQuestionSchema);
    if (errorResponse) return errorResponse;

    if (data?.upvote) {
        await liveSessionService.upvoteQuestion(questionId);
        return NextResponse.json({ success: true, message: 'Upvoted' });
    }

    if (data?.answer) {
        if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
        if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

        const question = await liveSessionService.answerQuestion(
            questionId,
            data.answer,
            ctx.user.id
        );
        return NextResponse.json({ success: true, data: question });
    }

    return NextResponse.json({ success: false, message: 'No action provided' }, { status: 400 });
}

export const PATCH = (req: any, ctx: any) => withApiProxy(patchHandler)(req, ctx);
