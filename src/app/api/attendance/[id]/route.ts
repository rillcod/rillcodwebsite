import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { attendanceService } from '@/services/attendance.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const updateAttendanceSchema = z.object({
    status: z.enum(['present', 'absent', 'late', 'excused']).optional(),
    notes: z.string().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Attendance ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await attendanceService.getAttendance(id, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function putHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to edit attendance', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Attendance ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, updateAttendanceSchema);
    if (errorResponse) return errorResponse;

    const tenantId = ctx.user?.tenantId;

    if (ctx.user?.role === 'school' && !tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const updated = await attendanceService.updateAttendance(id, data!, tenantId);

    return NextResponse.json({
        success: true,
        data: updated
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true })(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler, { requireAuth: true })(req, ctx);
