import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { gradesService } from '@/services/grades.service';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const studentId = url.searchParams.get('student_id');

    // Ensure they have permission to check the specific student's GPA
    if (ctx.user?.role === 'student' && studentId && studentId !== ctx.user.id) {
        throw new AppError('You can only view your own GPA', 403, true);
    }

    const targetId = studentId || ctx.user?.id;
    if (!targetId) {
        throw new AppError('User ID is missing', 400);
    }

    const gpaData = await gradesService.calculateGPA(targetId);

    return NextResponse.json({
        success: true,
        data: gpaData
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
