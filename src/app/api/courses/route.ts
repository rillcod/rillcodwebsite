import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { coursesService } from '@/services/courses.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const createCourseSchema = z.object({
    program_id: z.string().uuid("Invalid program ID"),
    title: z.string().min(3, "Title must be at least 3 characters"),
    description: z.string().optional(),
    content: z.string().optional(),
    duration_hours: z.number().int().positive().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    is_published: z.boolean().optional(),
    is_locked: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const programId = url.searchParams.get('program_id') || undefined;
    const isPublished = url.searchParams.has('is_published') ? url.searchParams.get('is_published') === 'true' : undefined;

    const tenantId = ctx.user?.tenantId;

    const result = await coursesService.listCourses({
        tenantId,
        programId,
        page,
        limit,
        isPublished
    });

    return NextResponse.json({
        success: true,
        data: result.data,
        metadata: result.metadata
    });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to create courses', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createCourseSchema);
    if (errorResponse) return errorResponse;

    if (ctx.user?.role === 'school' && !ctx.user?.tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const course = await coursesService.createCourse(data!, ctx.user?.tenantId as string);

    return NextResponse.json({
        success: true,
        data: course
    }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
// requireTenant: false — admin/teacher have no school_id; the handler guards school role itself
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
