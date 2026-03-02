import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { withValidation } from '@/proxies/validation.proxy';

async function listHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');

    const supabase = await createClient();
    let query;

    if (courseId) {
        query = supabase.from('live_sessions').select('*').eq('course_id', courseId);
    } else if (ctx.user?.tenantId) {
        // Join with courses to filter by school_id
        query = supabase.from('live_sessions').select('*, courses!inner(school_id)')
            .eq('courses.school_id', ctx.user.tenantId);
    } else {
        query = supabase.from('live_sessions').select('*');
    }

    const { data, error } = await query.order('scheduled_start', { ascending: true });
    if (error) throw new AppError(error.message, 500);

    return NextResponse.json({ success: true, data });
}

const createSessionSchema = z.object({
    courseId: z.string().uuid(),
    title: z.string().min(3),
    description: z.string().optional(),
    scheduledStart: z.string(),
    scheduledEnd: z.string(),
    provider: z.enum(['zoom', 'google_meet', 'microsoft_teams']),
    recordingEnabled: z.boolean().optional(),
    allowBreakoutRooms: z.boolean().optional(),
    allowScreenSharing: z.boolean().optional(),
    allowPolls: z.boolean().optional(),
});

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

    const { data, errorResponse } = await withValidation(req as any, createSessionSchema);
    if (errorResponse) return errorResponse;

    const session = await liveSessionService.scheduleLiveSession({
        courseId: data!.courseId,
        instructorId: ctx.user!.id,
        title: data!.title,
        description: data!.description,
        scheduledStart: data!.scheduledStart,
        scheduledEnd: data!.scheduledEnd,
        provider: data!.provider,
        recordingEnabled: data!.recordingEnabled,
        allowBreakoutRooms: data!.allowBreakoutRooms,
        allowScreenSharing: data!.allowScreenSharing,
        allowPolls: data!.allowPolls,
    });

    return NextResponse.json({ success: true, data: session });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
