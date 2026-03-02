import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const roomId = ctx.params?.roomId;
    if (!roomId) throw new AppError('Room ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const participant = await liveSessionService.addBreakoutParticipant(roomId, ctx.user.id);
    return NextResponse.json({ success: true, data: participant }, { status: 201 });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
