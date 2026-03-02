import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { attendanceService } from '@/services/attendance.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to mark attendance', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Attendance ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    const result = await attendanceService.markStatus(id, 'absent', tenantId);

    return NextResponse.json({
        success: true,
        data: result,
        message: 'Marked absent successfully'
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true })(req, ctx);
