import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';

const submitResponseSchema = z.object({
    optionIds: z.array(z.string().uuid()).min(1),
});

async function postHandler(req: Request, ctx: ApiContext) {
    const pollId = ctx.params?.pollId;
    if (!pollId) throw new AppError('Poll ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const { data, errorResponse } = await withValidation(req as any, submitResponseSchema);
    if (errorResponse) return errorResponse;

    await liveSessionService.submitPollResponse(pollId, data!.optionIds, ctx.user.id);
    return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
