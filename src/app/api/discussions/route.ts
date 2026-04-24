import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { discussionService } from '@/services/discussion.service';
import { withValidation } from '@/proxies/validation.proxy';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

const topicSchema = z.object({
    course_id: z.string().uuid(),
    title: z.string().min(3),
    content: z.string().min(10),
});

async function listHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');

    const supabase = await createClient();
    let query = supabase.from('discussion_topics').select('*, portal_users!created_by(full_name)');

    if (courseId) {
        query = query.eq('course_id', courseId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, 500);

    return NextResponse.json({ success: true, data });
}

async function postHandler(req: Request, ctx: ApiContext) {
    const { data, errorResponse } = await withValidation(req as any, topicSchema);
    if (errorResponse) return errorResponse;

    const topic = await discussionService.createTopic(
        data!.course_id,
        ctx.user!.id,
        data!.title,
        data!.content
    );

    return NextResponse.json({ success: true, data: topic });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
