import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { withValidation } from '@/proxies/validation.proxy';
import { libraryService } from '@/services/library.service';
import { AppError } from '@/lib/errors';

const updateContentSchema = z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    contentType: z.enum(['video', 'document', 'quiz', 'presentation', 'interactive']).optional(),
    fileId: z.string().uuid().optional().nullable(),
    category: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    subject: z.string().optional().nullable(),
    gradeLevel: z.string().optional().nullable(),
    licenseType: z.string().optional().nullable(),
    attribution: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Content ID missing', 400);

    const item = await libraryService.getContent(id, ctx.user?.tenantId, ctx.user?.role);
    return NextResponse.json({ success: true, data: item });
}

async function putHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Content ID missing', 400);
    if (!['admin', 'teacher'].includes(ctx.user?.role ?? '')) {
        throw new AppError('Only teachers and admins can update library content', 403);
    }

    const { data, errorResponse } = await withValidation(req as any, updateContentSchema);
    if (errorResponse) return errorResponse;

    const item = await libraryService.updateContent(id, ctx.user?.tenantId, ctx.user?.role, data!);
    return NextResponse.json({ success: true, data: item });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Content ID missing', 400);
    if (!['admin', 'teacher'].includes(ctx.user?.role ?? '')) {
        throw new AppError('Only teachers and admins can delete library content', 403);
    }

    await libraryService.deleteContent(id, ctx.user?.tenantId, ctx.user?.role);
    return NextResponse.json({ success: true });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler, { requireAuth: true, requireTenant: false })(req, ctx);
