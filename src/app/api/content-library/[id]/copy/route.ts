import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { withValidation } from '@/proxies/validation.proxy';
import { libraryService } from '@/services/library.service';
import { AppError } from '@/lib/errors';

const copySchema = z.object({
    courseId: z.string().uuid(),
});

const MUTATOR_ROLES = ['admin', 'teacher'];

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Content ID missing', 400);
    if (!ctx.user?.role || !MUTATOR_ROLES.includes(ctx.user.role)) {
        throw new AppError('Only teachers and admins can add library items to a course', 403);
    }

    const { data, errorResponse } = await withValidation(req as any, copySchema);
    if (errorResponse) return errorResponse;

    const material = await libraryService.copyToCourse(ctx.user?.tenantId, id, data!.courseId, ctx.user?.role);
    return NextResponse.json({ success: true, data: material }, { status: 201 });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
