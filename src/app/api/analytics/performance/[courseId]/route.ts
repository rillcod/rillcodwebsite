import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { analyticsService } from '@/services/analytics.service';

/**
 * GET /api/analytics/performance/[courseId]
 * Returns performance metrics for a specific course
 */
async function getPerformanceHandler(req: Request, ctx: ApiContext) {
    const courseId = ctx.params?.courseId;
    if (!courseId) return NextResponse.json({ error: 'Course ID missing' }, { status: 400 });

    const stats = await analyticsService.getCoursePerformance(courseId);
    return NextResponse.json({ success: true, data: stats });
}

export const GET = (req: any, ctx: any) => withApiProxy(getPerformanceHandler, { roles: ['admin', 'teacher'] })(req, ctx);
