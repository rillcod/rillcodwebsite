import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { coursesService } from '@/services/courses.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Course ID missing', 400);

    const userId = ctx.user?.id;
    if (!userId) throw new AppError('User missing', 401);

    const tenantId = ctx.user?.tenantId;
    await coursesService.unenrollCourse(id, userId, tenantId);

    return NextResponse.json({
        success: true,
        message: 'Successfully unenrolled'
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true })(req, ctx);
