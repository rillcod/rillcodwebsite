import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { coursesService } from '@/services/courses.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

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
    // Soft tagging payload — see migration 20260501000061_courses_metadata.sql.
    metadata: z
        .object({
            grade_levels: z.array(z.string()).optional(),
            subject: z.string().optional(),
            tags: z.array(z.string()).optional(),
        })
        .passthrough()
        .optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const programId = url.searchParams.get('program_id') || undefined;
    const isPublished = url.searchParams.has('is_published') ? url.searchParams.get('is_published') === 'true' : undefined;

    const schoolIds: string[] = [];
    if (ctx.user?.tenantId) schoolIds.push(ctx.user.tenantId);
    if (ctx.user?.role === 'teacher' && ctx.user.id) {
        const sids = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        sids.forEach(id => { if (!schoolIds.includes(id)) schoolIds.push(id); });
    }

    const result = await coursesService.listCourses({
        schoolIds,
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

    const schoolIds: string[] = [];
    if (ctx.user?.tenantId) schoolIds.push(ctx.user.tenantId);
    if (ctx.user?.role === 'teacher' && ctx.user.id) {
        const sids = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        sids.forEach(id => { if (!schoolIds.includes(id)) schoolIds.push(id); });
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
