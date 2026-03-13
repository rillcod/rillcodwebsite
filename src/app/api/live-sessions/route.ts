import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { liveSessionService } from '@/services/live-session.service';
import { AppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { withValidation } from '@/proxies/validation.proxy';

async function listHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const programId = searchParams.get('programId') ?? undefined;
    const schoolId = searchParams.get('schoolId') ?? undefined;
    const hostId = searchParams.get('hostId') ?? undefined;

    const sessions = await liveSessionService.listSessions({ programId, schoolId, hostId });
    return NextResponse.json({ success: true, data: sessions });
}

const createSessionSchema = z.object({
    title: z.string().min(3),
    description: z.string().optional(),
    scheduledAt: z.string(),
    durationMinutes: z.number().int().positive().optional(),
    platform: z.enum(['zoom', 'google_meet', 'teams', 'discord', 'other']).optional(),
    sessionUrl: z.string().optional(),
    programId: z.string().uuid().optional(),
    schoolId: z.string().uuid().optional(),
    notes: z.string().optional(),
});

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

    const { data, errorResponse } = await withValidation(req as any, createSessionSchema);
    if (errorResponse) return errorResponse;

    const session = await liveSessionService.scheduleLiveSession({
        hostId: ctx.user!.id,
        title: data!.title,
        description: data!.description,
        scheduledAt: data!.scheduledAt,
        durationMinutes: data!.durationMinutes,
        platform: data!.platform,
        sessionUrl: data!.sessionUrl,
        programId: data!.programId,
        schoolId: data!.schoolId,
        notes: data!.notes,
    });

    return NextResponse.json({ success: true, data: session });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
