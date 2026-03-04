import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { analyticsService } from '@/services/analytics.service';

/**
 * GET /api/analytics/at-risk
 * Returns a list of learners flagged as at-risk based on low engagement or performance
 */
async function getAtRiskHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const schoolId = searchParams.get('schoolId');

    // School admins can only see their own school
    const effectiveSchoolId = ctx.user?.role === 'school' ? ctx.user?.tenantId : (schoolId || undefined);

    const students = await analyticsService.getAtRiskStudents(effectiveSchoolId);
    return NextResponse.json({ success: true, data: students });
}

export const GET = (req: any, ctx: any) => withApiProxy(getAtRiskHandler, { roles: ['admin', 'teacher', 'school'] })(req, ctx);
