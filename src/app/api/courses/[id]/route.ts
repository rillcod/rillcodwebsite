import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { coursesService } from '@/services/courses.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const updateCourseSchema = z.object({
    program_id: z.string().uuid("Invalid program ID").optional(),
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    content: z.string().optional(),
    duration_hours: z.number().int().positive().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    is_published: z.boolean().optional(),
    is_locked: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Course ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await coursesService.getCourse(id, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function putHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to update courses', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Course ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, updateCourseSchema);
    if (errorResponse) return errorResponse;

    const tenantId = ctx.user?.tenantId;

    if (ctx.user?.role === 'school' && !tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const updated = await coursesService.updateCourse(id, data!, tenantId);

    return NextResponse.json({
        success: true,
        data: updated
    });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school') {
        throw new AppError('Not authorized to delete courses', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Course ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    await coursesService.deleteCourse(id, tenantId);

    return NextResponse.json({
        success: true,
        message: 'Course deleted successfully'
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true })(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler, { requireAuth: true })(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler, { requireAuth: true })(req, ctx);
