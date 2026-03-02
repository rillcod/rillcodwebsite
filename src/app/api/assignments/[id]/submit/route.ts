import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { assignmentsService } from '@/services/assignments.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const submitAssignmentSchema = z.object({
    submission_text: z.string().optional(),
    file_url: z.string().url().optional(),
}).refine(data => data.submission_text || data.file_url, {
    message: "Either submission_text or file_url must be provided"
});

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Assignment ID missing', 400);

    const userId = ctx.user?.id;
    if (!userId) throw new AppError('User missing', 401);

    const { data, errorResponse } = await withValidation(req as any, submitAssignmentSchema);
    if (errorResponse) return errorResponse;

    const tenantId = ctx.user?.tenantId;
    const result = await assignmentsService.submitAssignment(id, userId, data!, tenantId);

    return NextResponse.json({
        success: true,
        data: result,
        message: 'Assignment submitted successfully'
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true })(req, ctx);
