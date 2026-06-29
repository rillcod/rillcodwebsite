import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    canManageLiveSession,
    requireLiveSessionAccess,
    requireLiveSessionManager,
} from '@/lib/live-sessions/authz';

const createPollSchema = z.object({
    question: z.string().min(3),
    pollType: z.enum(['poll', 'quiz']).default('poll'),
    allowMultiple: z.boolean().optional(),
    options: z.array(z.object({
        text: z.string().min(1),
        isCorrect: z.boolean().optional(),
    })).min(2),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin.from('live_sessions').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!session) throw new AppError('Session not found', 404);
    await requireLiveSessionAccess(admin, { id: ctx.user!.id, role: ctx.user!.role, school_id: ctx.user?.tenantId }, session);
    const canManage = await canManageLiveSession(admin, { id: ctx.user!.id, role: ctx.user!.role, school_id: ctx.user?.tenantId }, session);

    const polls = await liveSessionService.listPolls(id);
    const safePolls = canManage
        ? polls
        : polls.map((poll: any) => ({
            ...poll,
            options: (poll.options ?? []).map(({ is_correct, ...option }: any) => option),
            live_session_poll_options: undefined,
        }));
    return NextResponse.json({ success: true, data: safePolls });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    const admin = createAdminClient() as any;
    const { data: session, error } = await admin.from('live_sessions').select('*').eq('id', id).maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!session) throw new AppError('Session not found', 404);
    await requireLiveSessionManager(admin, { id: ctx.user!.id, role: ctx.user!.role, school_id: ctx.user?.tenantId }, session);

    const { data, errorResponse } = await withValidation(req as any, createPollSchema);
    if (errorResponse) return errorResponse;

    const poll = await liveSessionService.createPoll(
        id,
        data!.question,
        data!.pollType,
        data!.options.map((opt) => ({ text: opt.text, isCorrect: opt.isCorrect })),
        ctx.user?.id,
        data!.allowMultiple ?? false
    );

    return NextResponse.json({ success: true, data: poll }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
