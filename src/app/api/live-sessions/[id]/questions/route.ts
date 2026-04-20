import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

// GET — list all questions for a session
async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const supabase = await createClient();
    const { data, error } = await supabase
        .from('live_session_questions')
        .select('*, portal_users(full_name, role)')
        .eq('session_id', id)
        .order('created_at', { ascending: true });

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true, data: data ?? [] });
}

// POST — ask a question
async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const { body } = await (req as any).json();
    if (!body?.trim()) throw new AppError('Question cannot be empty', 400);

    const supabase = await createClient();
    const { data, error } = await supabase
        .from('live_session_questions')
        .insert({ session_id: id, user_id: ctx.user.id, body: body.trim() })
        .select('*, portal_users(full_name, role)')
        .single();

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true, data }, { status: 201 });
}

export const GET  = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
