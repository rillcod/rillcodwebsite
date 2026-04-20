import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    if (!['admin', 'teacher', 'school'].includes(ctx.user?.role ?? ''))
        throw new AppError('Forbidden', 403);

    const attendance = await liveSessionService.getSessionAttendance(id);
    return NextResponse.json({ success: true, data: attendance });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
