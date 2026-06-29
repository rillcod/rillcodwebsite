import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireLiveSessionAccess } from '@/lib/live-sessions/authz';

const submitResponseSchema = z.object({
    optionIds: z.array(z.string().uuid()).min(1),
});

async function postHandler(req: Request, ctx: ApiContext) {
    const sessionId = ctx.params?.id;
    const pollId = ctx.params?.pollId;
    if (!sessionId) throw new AppError('Session ID missing', 400);
    if (!pollId) throw new AppError('Poll ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);

    const { data, errorResponse } = await withValidation(req as any, submitResponseSchema);
    if (errorResponse) return errorResponse;

    const admin = createAdminClient() as any;
    const { data: poll, error: pollErr } = await admin
        .from('live_session_polls')
        .select('id, session_id, status, allow_multiple, live_sessions(*)')
        .eq('id', pollId)
        .maybeSingle();
    if (pollErr) throw new AppError(pollErr.message, 500);
    if (!poll || poll.session_id !== sessionId) throw new AppError('Poll not found for this session', 404);
    if (poll.status !== 'live') throw new AppError('Poll is not open', 400);
    if (!poll.allow_multiple && data!.optionIds.length > 1) throw new AppError('This poll accepts only one option', 400);

    const session = Array.isArray((poll as any).live_sessions)
        ? (poll as any).live_sessions[0]
        : (poll as any).live_sessions;
    await requireLiveSessionAccess(admin, { id: ctx.user.id, role: ctx.user.role, school_id: ctx.user.tenantId }, session);

    const { data: options, error: optionsErr } = await admin
        .from('live_session_poll_options')
        .select('id')
        .eq('poll_id', pollId)
        .in('id', data!.optionIds);
    if (optionsErr) throw new AppError(optionsErr.message, 500);
    if ((options ?? []).length !== data!.optionIds.length) {
        throw new AppError('One or more selected options do not belong to this poll', 400);
    }

    if (!poll.allow_multiple) {
        await admin
            .from('live_session_poll_responses')
            .delete()
            .eq('poll_id', pollId)
            .eq('portal_user_id', ctx.user.id);
    }

    const payload = data!.optionIds.map(optionId => ({
        poll_id: pollId,
        option_id: optionId,
        portal_user_id: ctx.user!.id,
    }));
    const { error } = await admin.from('live_session_poll_responses').insert(payload);
    if (error) throw new AppError(error.message, 500);

    return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
