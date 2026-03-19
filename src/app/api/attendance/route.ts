import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { attendanceService } from '@/services/attendance.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const createAttendanceSchema = z.object({
    session_id: z.string().uuid("Invalid session ID"),
    user_id: z.string().uuid("Invalid user ID"),
    status: z.enum(['present', 'absent', 'late', 'excused']),
    notes: z.string().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) throw new AppError('session_id is required', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await attendanceService.listAttendance(sessionId, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'teacher') {
        throw new AppError('Only administrators and teachers can mark attendance', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createAttendanceSchema);
    if (errorResponse) return errorResponse;

    const attendance = await attendanceService.createAttendance(data!, ctx.user?.tenantId as string);

    return NextResponse.json({
        success: true,
        data: attendance
    }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
