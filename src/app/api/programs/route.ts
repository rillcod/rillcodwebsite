import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { programsService } from '@/services/programs.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const createProgramSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters"),
    description: z.string().optional(),
    duration_weeks: z.number().int().positive().optional(),
    difficulty_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    price: z.number().min(0).optional(),
    max_students: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const isActive = url.searchParams.has('is_active') ? url.searchParams.get('is_active') === 'true' : undefined;

    const tenantId = ctx.user?.tenantId;

    const result = await programsService.listPrograms({
        tenantId,
        page,
        limit,
        isActive
    });

    return NextResponse.json({
        success: true,
        data: result.data,
        metadata: result.metadata
    });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school') {
        throw new AppError('Not authorized to create programs', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createProgramSchema);
    if (errorResponse) return errorResponse;

    if (!ctx.user?.tenantId) {
        throw new AppError('Tenant context missing', 403, true);
    }

    const program = await programsService.createProgram(data!, ctx.user.tenantId);

    return NextResponse.json({
        success: true,
        data: program
    }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: true })(req, ctx);
