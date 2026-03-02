import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { assignmentsService } from '@/services/assignments.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const gradeAssignmentSchema = z.object({
    submission_id: z.string().uuid("Invalid submission ID"),
    grade: z.number().int().min(0).max(100),
    feedback: z.string().optional(),
});

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'teacher' && ctx.user?.role !== 'school') {
        throw new AppError('Not authorized to grade assignments', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Assignment ID missing', 400);

    const graderId = ctx.user?.id;
    if (!graderId) throw new AppError('User missing', 401);

    const { data, errorResponse } = await withValidation(req as any, gradeAssignmentSchema);
    if (errorResponse) return errorResponse;

    const tenantId = ctx.user?.tenantId;
    const result = await assignmentsService.gradeAssignment(
        id,
        data!.submission_id,
        graderId,
        data!.grade,
        data!.feedback,
        tenantId
    );

    return NextResponse.json({
        success: true,
        data: result,
        message: 'Assignment graded successfully'
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true })(req, ctx);
