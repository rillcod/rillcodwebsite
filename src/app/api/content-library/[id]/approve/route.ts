import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { withValidation } from '@/proxies/validation.proxy';
import { libraryService } from '@/services/library.service';
import { AppError } from '@/lib/errors';

const approveSchema = z.object({
    approved: z.boolean(),
});

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin') throw new AppError('Forbidden', 403);
    const id = ctx.params?.id;
    if (!id) throw new AppError('Content ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, approveSchema);
    if (errorResponse) return errorResponse;

    const item = await libraryService.approveContent(ctx.user!.tenantId!, id, ctx.user!.id, data!.approved);
    return NextResponse.json({ success: true, data: item });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireTenant: true })(req, ctx);
