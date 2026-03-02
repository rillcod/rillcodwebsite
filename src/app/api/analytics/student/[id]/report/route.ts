import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { analyticsService } from '@/services/analytics.service';

/**
 * GET /api/analytics/student/[id]/report
 * Generates a comprehensive progress report for a student
 */
async function getStudentReportHandler(req: Request, ctx: ApiContext) {
    const studentId = ctx.params?.id;
    if (!studentId) return NextResponse.json({ error: 'Student ID missing' }, { status: 400 });

    // Students can only view their own report
    if (ctx.user?.role === 'student' && ctx.user?.id !== studentId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const report = await analyticsService.generateStudentReport(studentId);
    return NextResponse.json({ success: true, data: report });
}

export const GET = (req: any, ctx: any) => withApiProxy(getStudentReportHandler)(req, ctx);
