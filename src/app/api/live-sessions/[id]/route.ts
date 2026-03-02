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
    scheduledStart: z.string().optional(),
    scheduledEnd: z.string().optional(),
    recordingEnabled: z.boolean().optional(),
    allowBreakoutRooms: z.boolean().optional(),
    allowScreenSharing: z.boolean().optional(),
    allowPolls: z.boolean().optional(),
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

    const detailKeys = ['title', 'description', 'scheduledStart', 'scheduledEnd', 'recordingEnabled', 'allowBreakoutRooms', 'allowScreenSharing', 'allowPolls'];
    const hasDetailUpdates = detailKeys.some((key) => (data as any)?.[key] !== undefined);
    if (hasDetailUpdates) {
        updated = await liveSessionService.updateSessionDetails(id, {
            title: data?.title,
            description: data?.description,
            scheduledStart: data?.scheduledStart,
            scheduledEnd: data?.scheduledEnd,
            recordingEnabled: data?.recordingEnabled,
            allowBreakoutRooms: data?.allowBreakoutRooms,
            allowScreenSharing: data?.allowScreenSharing,
            allowPolls: data?.allowPolls,
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
