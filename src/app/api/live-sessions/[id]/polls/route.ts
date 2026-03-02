import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';

const createPollSchema = z.object({
    question: z.string().min(3),
    pollType: z.enum(['poll', 'quiz']).default('poll'),
    allowMultiple: z.boolean().optional(),
    options: z.array(z.object({
        text: z.string().min(1),
        isCorrect: z.boolean().optional(),
    })).min(2),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const polls = await liveSessionService.listPolls(id);
    return NextResponse.json({ success: true, data: polls });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, createPollSchema);
    if (errorResponse) return errorResponse;

    const poll = await liveSessionService.createPoll(
        id,
        data!.question,
        data!.pollType,
        data!.options.map((opt) => ({ text: opt.text, isCorrect: opt.isCorrect })),
        ctx.user?.id,
        data!.allowMultiple ?? false
    );

    return NextResponse.json({ success: true, data: poll }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
