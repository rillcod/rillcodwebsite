import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { programsService } from '@/services/programs.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const updateProgramSchema = z.object({
    name: z.string().min(3).optional(),
    description: z.string().optional(),
    duration_weeks: z.number().int().positive().optional(),
    difficulty_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    price: z.number().min(0).optional(),
    max_students: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Program ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await programsService.getProgram(id, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function putHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school') {
        throw new AppError('Not authorized to edit programs', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Program ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, updateProgramSchema);
    if (errorResponse) return errorResponse;

    const tenantId = ctx.user?.tenantId;

    if (ctx.user?.role === 'school' && !tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const updated = await programsService.updateProgram(id, data!, tenantId);

    return NextResponse.json({
        success: true,
        data: updated
    });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school') {
        throw new AppError('Not authorized to delete programs', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Program ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    await programsService.deleteProgram(id, tenantId);

    return NextResponse.json({
        success: true,
        message: 'Program deleted successfully'
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true })(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler, { requireAuth: true })(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler, { requireAuth: true })(req, ctx);
