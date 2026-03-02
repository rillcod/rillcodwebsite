import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { analyticsService } from '@/services/analytics.service';
import { AppError } from '@/lib/errors';

async function postTrackHandler(req: Request, ctx: ApiContext) {
    const { eventType, metadata } = await req.json();
    if (!eventType) throw new AppError('Event type missing', 400);

    await analyticsService.trackEvent(ctx.user!.id, eventType, metadata);
    return NextResponse.json({ success: true });
}

async function getCohortAnalyticsHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const programId = searchParams.get('programId');

    if (!programId) throw new AppError('Program ID missing', 400);

    const stats = await analyticsService.getCohortAnalytics(programId);
    return NextResponse.json({ success: true, data: stats });
}

export const POST = (req: any, ctx: any) => withApiProxy(postTrackHandler)(req, ctx);
export const GET = (req: any, ctx: any) => withApiProxy(getCohortAnalyticsHandler)(req, ctx);
