import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const meetingUrl = await liveSessionService.joinSession(id, ctx.user.id);
    return NextResponse.json({ success: true, data: { meetingUrl } });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
