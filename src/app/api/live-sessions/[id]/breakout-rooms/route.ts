import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireLiveSessionAccess, requireLiveSessionManager } from '@/lib/live-sessions/authz';

const createRoomSchema = z.object({
    name: z.string().min(2),
    maxParticipants: z.number().int().positive().optional(),
});

async function loadSessionOrThrow(sessionId: string) {
    const admin = createAdminClient() as any;
    const { data: session, error } = await admin.from('live_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!session) throw new AppError('Session not found', 404);
    return { admin, session };
}

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    const { admin, session } = await loadSessionOrThrow(id);
    await requireLiveSessionAccess(admin, { id: ctx.user!.id, role: ctx.user!.role, school_id: ctx.user?.tenantId }, session);

    const rooms = await liveSessionService.listBreakoutRooms(id);
    return NextResponse.json({ success: true, data: rooms });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    const { admin, session } = await loadSessionOrThrow(id);
    await requireLiveSessionManager(admin, { id: ctx.user!.id, role: ctx.user!.role, school_id: ctx.user?.tenantId }, session);

    const { data, errorResponse } = await withValidation(req as any, createRoomSchema);
    if (errorResponse) return errorResponse;

    const room = await liveSessionService.createBreakoutRoom(id, data!.name, data!.maxParticipants, ctx.user?.id);
    return NextResponse.json({ success: true, data: room }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
