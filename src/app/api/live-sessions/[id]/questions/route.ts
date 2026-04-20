import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';

const postQuestionSchema = z.object({
    body: z.string().min(3),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const questions = await liveSessionService.listQuestions(id);
    return NextResponse.json({ success: true, data: questions });
}

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const { data, errorResponse } = await withValidation(req as any, postQuestionSchema);
    if (errorResponse) return errorResponse;

    const question = await liveSessionService.postQuestion(
        id,
        ctx.user.id,
        data!.body
    );

    return NextResponse.json({ success: true, data: question }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
