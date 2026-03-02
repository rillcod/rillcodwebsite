import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { lessonsService } from '@/services/lessons.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const trackProgressSchema = z.object({
    timeSpentMinutes: z.number().int().min(0).default(0),
    progressPercentage: z.number().int().min(0).max(100).default(100),
});

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Lesson ID missing', 400);

    const userId = ctx.user?.id;
    if (!userId) throw new AppError('User missing', 401);

    const { data, errorResponse } = await withValidation(req as any, trackProgressSchema);
    if (errorResponse) return errorResponse;

    const result = await lessonsService.markLessonComplete(
        id,
        userId,
        data!.timeSpentMinutes ?? 0,
        data!.progressPercentage ?? 100
    );

    return NextResponse.json({
        success: true,
        data: result,
        message: 'Progress tracked successfully'
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true })(req, ctx);
