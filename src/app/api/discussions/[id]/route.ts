import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { discussionService } from '@/services/discussion.service';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Topic ID missing', 400);

    const supabase = await createClient();
    const { data: topic, error } = await supabase
        .from('discussion_topics')
        .select('*, portal_users!created_by(full_name), discussion_replies(*, portal_users!created_by(full_name))')
        .eq('id', id)
        .single();

    if (error) throw new AppError(error.message, 500);
    return NextResponse.json({ success: true, data: topic });
}

async function putHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    const { title, content } = await req.json();

    // Permission check: Author or Instructor/Admin
    const supabase = await createClient();
    const { data: topic } = await supabase.from('discussion_topics').select('created_by').eq('id', id).single();

    if (topic?.created_by !== ctx.user!.id && !['teacher', 'admin'].includes(ctx.user!.role)) {
        throw new AppError('Unauthorized', 403);
    }

    await discussionService.updateTopic(id!, ctx.user!.id, title, content);
    return NextResponse.json({ success: true });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;

    // Permission check: Author or Instructor/Admin
    const supabase = await createClient();
    const { data: topic } = await supabase.from('discussion_topics').select('created_by').eq('id', id).single();

    if (topic?.created_by !== ctx.user!.id && !['teacher', 'admin'].includes(ctx.user!.role)) {
        throw new AppError('Unauthorized', 403);
    }

    await discussionService.deleteTopic(id!);
    return NextResponse.json({ success: true });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
