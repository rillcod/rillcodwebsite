import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { discussionService } from '@/services/discussion.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Topic ID missing', 400);

    const { action } = await req.json(); // 'subscribe' or 'unsubscribe'

    if (action === 'subscribe') {
        await discussionService.subscribe(ctx.user!.id, id);
    } else if (action === 'unsubscribe') {
        await discussionService.unsubscribe(ctx.user!.id, id);
    } else {
        throw new AppError('Invalid action', 400);
    }

    return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
