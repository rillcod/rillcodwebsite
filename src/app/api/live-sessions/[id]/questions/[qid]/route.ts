import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

// PATCH — answer a question (staff) or upvote (anyone)
async function patchHandler(req: Request, ctx: ApiContext) {
    const qid = ctx.params?.qid;
    if (!qid) throw new AppError('Question ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const body = await (req as any).json();
    const supabase = await createClient();

    if (body.action === 'upvote') {
        const { data, error } = await supabase.rpc('increment_question_upvotes', { question_id: qid });
        if (error) {
            // Fallback: manual increment
            const { data: q } = await supabase.from('live_session_questions').select('upvotes').eq('id', qid).single();
            await supabase.from('live_session_questions').update({ upvotes: (q?.upvotes ?? 0) + 1 }).eq('id', qid);
        }
        return NextResponse.json({ success: true });
    }

    if (body.action === 'answer') {
        if (!['admin', 'teacher'].includes(ctx.user.role)) throw new AppError('Forbidden', 403);
        const { data, error } = await supabase
            .from('live_session_questions')
            .update({
                answered: true,
                answer: body.answer?.trim() || null,
                answered_by: ctx.user.id,
                answered_at: new Date().toISOString(),
            })
            .eq('id', qid)
            .select('*, portal_users(full_name, role)')
            .single();
        if (error) throw new AppError(error.message, 500);
        return NextResponse.json({ success: true, data });
    }

    throw new AppError('Invalid action', 400);
}

// DELETE — remove a question (own or staff)
async function deleteHandler(req: Request, ctx: ApiContext) {
    const qid = ctx.params?.qid;
    if (!qid) throw new AppError('Question ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const supabase = await createClient();
    const { error } = await supabase
        .from('live_session_questions')
        .delete()
        .eq('id', qid);

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true });
}

export const PATCH  = (req: any, ctx: any) => withApiProxy(patchHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
