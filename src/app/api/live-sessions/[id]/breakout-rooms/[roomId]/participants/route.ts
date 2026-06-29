import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireLiveSessionAccess } from '@/lib/live-sessions/authz';

async function postHandler(req: Request, ctx: ApiContext) {
    const sessionId = ctx.params?.id;
    const roomId = ctx.params?.roomId;
    if (!sessionId) throw new AppError('Session ID missing', 400);
    if (!roomId) throw new AppError('Room ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const admin = createAdminClient() as any;
    const { data: room, error: roomErr } = await admin
        .from('live_session_breakout_rooms')
        .select('id, session_id, max_participants, live_sessions(*)')
        .eq('id', roomId)
        .maybeSingle();
    if (roomErr) throw new AppError(roomErr.message, 500);
    if (!room || room.session_id !== sessionId) throw new AppError('Room not found for this session', 404);

    const session = Array.isArray((room as any).live_sessions)
        ? (room as any).live_sessions[0]
        : (room as any).live_sessions;
    await requireLiveSessionAccess(admin, { id: ctx.user.id, role: ctx.user.role, school_id: ctx.user.tenantId }, session);

    if (room.max_participants) {
        const { count, error: countErr } = await admin
            .from('live_session_breakout_participants')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', roomId);
        if (countErr) throw new AppError(countErr.message, 500);
        if ((count ?? 0) >= room.max_participants) throw new AppError('Breakout room is full', 409);
    }

    const { data: existing } = await admin
        .from('live_session_breakout_participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('portal_user_id', ctx.user.id)
        .maybeSingle();
    if (existing) return NextResponse.json({ success: true, data: existing }, { status: 200 });

    const { data: participant, error } = await admin
        .from('live_session_breakout_participants')
        .insert({ room_id: roomId, portal_user_id: ctx.user.id, joined_at: new Date().toISOString() })
        .select()
        .single();
    if (error) throw new AppError(error.message, 500);

    return NextResponse.json({ success: true, data: participant }, { status: 201 });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
