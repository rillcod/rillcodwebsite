import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { withValidation } from '@/proxies/validation.proxy';

const updateSessionSchema = z.object({
    status: z.enum(['scheduled', 'live', 'completed', 'cancelled']).optional(),
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    scheduledAt: z.string().optional(),
    durationMinutes: z.number().int().positive().optional(),
    platform: z.enum(['zoom', 'google_meet', 'teams', 'discord', 'other']).optional(),
    sessionUrl: z.string().optional(),
    programId: z.string().uuid().optional(),
    schoolId: z.string().uuid().optional(),
    recordingUrl: z.string().optional(),
    notes: z.string().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const session = await liveSessionService.getSession(id);
    return NextResponse.json({ success: true, data: session });
}

async function putHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, updateSessionSchema);
    if (errorResponse) return errorResponse;

    let updated = null;

    if (data?.status) {
        updated = await liveSessionService.updateSessionStatus(id, data.status);
    }

    const hasDetailUpdates = ['title', 'description', 'scheduledAt', 'durationMinutes', 'platform', 'sessionUrl', 'programId', 'schoolId', 'recordingUrl', 'notes'].some((key) => (data as Record<string, unknown>)?.[key] !== undefined);
    if (hasDetailUpdates) {
        updated = await liveSessionService.updateSessionDetails(id, {
            title: data?.title,
            description: data?.description,
            scheduledAt: data?.scheduledAt,
            durationMinutes: data?.durationMinutes,
            platform: data?.platform,
            sessionUrl: data?.sessionUrl,
            programId: data?.programId,
            schoolId: data?.schoolId,
            recordingUrl: data?.recordingUrl,
            notes: data?.notes,
            status: data?.status,
        });
    }

    return NextResponse.json({ success: true, data: updated });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
    const id = ctx.params?.id;
    if (!id) throw new AppError('Session ID missing', 400);

    const session = await liveSessionService.updateSessionStatus(id, 'cancelled');
    return NextResponse.json({ success: true, data: session });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
