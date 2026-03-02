import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { discussionService } from '@/services/discussion.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id; // topicId
    if (!id) throw new AppError('Topic ID missing', 400);

    const { content, parentReplyId } = await req.json();
    if (!content) throw new AppError('Content missing', 400);

    const reply = await discussionService.createReply(id, ctx.user!.id, content, parentReplyId);
    return NextResponse.json({ success: true, data: reply });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
