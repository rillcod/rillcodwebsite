import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireLiveSessionAccess } from '@/lib/live-sessions/authz';

const postQuestionSchema = z.object({
    body: z.string().min(3),
});

async function requireSessionAccess(ctx: ApiContext, sessionId: string) {
    const admin = createAdminClient() as any;
    const { data: session, error } = await admin.from('live_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!session) throw new AppError('Session not found', 404);
    await requireLiveSessionAccess(admin, { id: ctx.user!.id, role: ctx.user!.role, school_id: ctx.user?.tenantId }, session);
}

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    await requireSessionAccess(ctx, id);

    const questions = await liveSessionService.listQuestions(id);
    return NextResponse.json({ success: true, data: questions });
}

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);
    if (!ctx.user?.id) throw new AppError('Unauthorized', 401);
    await requireSessionAccess(ctx, id);

    const { data, errorResponse } = await withValidation(req as any, postQuestionSchema);
    if (errorResponse) return errorResponse;

    const question = await liveSessionService.postQuestion(
        id,
        ctx.user.id,
        data!.body
    );

    return NextResponse.json({ success: true, data: question }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
