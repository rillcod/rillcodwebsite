import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/live-sessions/[id]/polls/[pollId] — update poll status (draft→live→closed)
async function patchHandler(req: Request, ctx: ApiContext) {
    const pollId = ctx.params?.pollId;
    if (!pollId) throw new AppError('Poll ID missing', 400);
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

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
    const pollId = ctx.params?.pollId;
    if (!pollId) throw new AppError('Poll ID missing', 400);
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

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
