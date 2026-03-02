import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { discussionService } from '@/services/discussion.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') || 'topic') as 'topic' | 'reply';

    if (!id) throw new AppError('ID missing', 400);

    await discussionService.upvote(type, id);
    return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
