import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { assignmentsService } from '@/services/assignments.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const updateAssignmentSchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    instructions: z.string().optional(),
    due_date: z.string().optional(),
    max_points: z.number().int().positive().optional(),
    assignment_type: z.enum(['homework', 'project', 'quiz', 'exam', 'presentation']).optional(),
    is_active: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Assignment ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await assignmentsService.getAssignment(id, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function putHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to edit assignments', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Assignment ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, updateAssignmentSchema);
    if (errorResponse) return errorResponse;

    const tenantId = ctx.user?.tenantId;

    if (ctx.user?.role === 'school' && !tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const updated = await assignmentsService.updateAssignment(id, data!, tenantId);

    return NextResponse.json({
        success: true,
        data: updated
    });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to delete assignments', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Assignment ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    await assignmentsService.deleteAssignment(id, tenantId);

    return NextResponse.json({
        success: true,
        message: 'Assignment deleted successfully'
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true })(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler, { requireAuth: true })(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler, { requireAuth: true })(req, ctx);
