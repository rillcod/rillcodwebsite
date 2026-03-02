import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { assignmentsService } from '@/services/assignments.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const createAssignmentSchema = z.object({
    course_id: z.string().uuid("Invalid course ID"),
    title: z.string().min(3),
    description: z.string().optional(),
    instructions: z.string().optional(),
    due_date: z.string().optional(),
    max_points: z.number().int().positive().optional(),
    assignment_type: z.enum(['homework', 'project', 'quiz', 'exam', 'presentation']).optional(),
    is_active: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const courseId = url.searchParams.get('course_id');
    if (!courseId) throw new AppError('course_id is required', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await assignmentsService.listAssignments(courseId, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to create assignments', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createAssignmentSchema);
    if (errorResponse) return errorResponse;

    if (ctx.user?.role === 'school' && !ctx.user?.tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const assignment = await assignmentsService.createAssignment(data!, ctx.user!.id, ctx.user?.tenantId);

    return NextResponse.json({
        success: true,
        data: assignment
    }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
