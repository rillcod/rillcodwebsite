import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireLiveSessionManager } from '@/lib/live-sessions/authz';

async function requirePollManager(ctx: ApiContext) {
    const sessionId = ctx.params?.id;
    const pollId = ctx.params?.pollId;
    if (!sessionId) throw new AppError('Session ID missing', 400);
    if (!pollId) throw new AppError('Poll ID missing', 400);
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

    const admin = createAdminClient() as any;
    const { data: poll, error: pollErr } = await admin
        .from('live_session_polls')
        .select('id, session_id, live_sessions(*)')
        .eq('id', pollId)
        .maybeSingle();
    if (pollErr) throw new AppError(pollErr.message, 500);
    if (!poll || poll.session_id !== sessionId) throw new AppError('Poll not found for this session', 404);

    const session = Array.isArray((poll as any).live_sessions)
        ? (poll as any).live_sessions[0]
        : (poll as any).live_sessions;
    await requireLiveSessionManager(admin, { id: ctx.user!.id, role: ctx.user!.role, school_id: ctx.user?.tenantId }, session);
    return { pollId };
}

// PATCH /api/live-sessions/[id]/polls/[pollId] — update poll status (draft→live→closed)
async function patchHandler(req: Request, ctx: ApiContext) {
    const { pollId } = await requirePollManager(ctx);

    const body = await (req as any).json();
    const { status } = body;
    if (!['draft', 'live', 'closed'].includes(status))
        throw new AppError('Invalid status', 400);

    const supabase = await createClient();
    const updates = { 
        status,
        ...(status === 'live' && { started_at: new Date().toISOString() }),
        ...(status === 'closed' && { ended_at: new Date().toISOString() })
    };

    const { data, error } = await supabase
        .from('live_session_polls')
        .update(updates)
        .eq('id', pollId)
        .select()
        .single();

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true, data });
}

// DELETE /api/live-sessions/[id]/polls/[pollId]
async function deleteHandler(req: Request, ctx: ApiContext) {
    const { pollId } = await requirePollManager(ctx);

    const supabase = await createClient();
    const { error } = await supabase
        .from('live_session_polls')
        .delete()
        .eq('id', pollId);

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true });
}

export const PATCH  = (req: any, ctx: any) => withApiProxy(patchHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
