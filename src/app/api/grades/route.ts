import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { gradesService } from '@/services/grades.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const createGradeSchema = z.object({
    student_id: z.string().uuid("Invalid student ID"),
    program_id: z.string().uuid("Invalid program ID"),
    grade: z.string().min(1),
    notes: z.string().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const studentId = url.searchParams.get('student_id');

    if (!studentId && ctx.user?.role === 'student') {
        // Default to self for student
        return NextResponse.json({
            success: true,
            data: await gradesService.listGrades(ctx.user.id, url.searchParams.get('program_id') || undefined, ctx.user.tenantId)
        });
    }

    if (!studentId) {
        throw new AppError('student_id is required', 400);
    }

    const tenantId = ctx.user?.tenantId;
    const data = await gradesService.listGrades(studentId, url.searchParams.get('program_id') || undefined, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to manage grades', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createGradeSchema);
    if (errorResponse) return errorResponse;

    if (ctx.user?.role === 'school' && !ctx.user?.tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const result = await gradesService.createGrade(data!.student_id, data!.program_id, data!.grade, data!.notes, ctx.user?.tenantId as string);

    return NextResponse.json({
        success: true,
        data: result
    }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
