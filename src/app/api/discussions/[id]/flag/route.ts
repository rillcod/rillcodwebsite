import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { discussionService } from '@/services/discussion.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    const { reason, type } = await req.json();

    if (!id || !reason) throw new AppError('Missing required fields', 400);

    const contentType = type === 'reply' ? 'reply' : 'topic';

    await discussionService.flagContent(ctx.user!.id, contentType, id, reason);
    return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
