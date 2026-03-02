import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { discussionService } from '@/services/discussion.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Topic ID missing', 400);

    const { action } = await req.json();
    if (!['pin', 'lock', 'unpin', 'unlock', 'resolve'].includes(action)) {
        throw new AppError('Invalid moderation action', 400);
    }

    // Role check: Only teachers or admins can pin/lock
    if (['pin', 'lock', 'unpin', 'unlock'].includes(action)) {
        if (!['teacher', 'admin'].includes(ctx.user!.role)) {
            throw new AppError('Unauthorized', 403);
        }
    }

    await discussionService.moderateTopic(id, action);
    return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
