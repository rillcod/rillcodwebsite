import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { lessonsService } from '@/services/lessons.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const createLessonSchema = z.object({
    course_id: z.string().uuid("Invalid course ID"),
    title: z.string().min(3, "Title must be at least 3 characters"),
    description: z.string().optional(),
    content: z.string().optional(),
    lesson_type: z.enum(['video', 'reading', 'interactive', 'hands-on', 'workshop', 'coding']).optional(),
    duration_minutes: z.number().int().positive().optional(),
    order_index: z.number().int().optional(),
    video_url: z.string().url().optional(),
    is_active: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const courseId = url.searchParams.get('course_id');
    if (!courseId) {
        throw new AppError('course_id is required', 400);
    }

    const tenantId = ctx.user?.tenantId;
    const data = await lessonsService.listLessons(courseId, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to create lessons', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createLessonSchema);
    if (errorResponse) return errorResponse;

    if (ctx.user?.role === 'school' && !ctx.user?.tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const lesson = await lessonsService.createLesson(data!, ctx.user?.id as string, ctx.user?.tenantId as string);

    return NextResponse.json({
        success: true,
        data: lesson
    }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
