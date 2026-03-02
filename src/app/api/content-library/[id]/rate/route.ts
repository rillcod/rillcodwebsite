import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { withValidation } from '@/proxies/validation.proxy';
import { libraryService } from '@/services/library.service';
import { AppError } from '@/lib/errors';

const rateSchema = z.object({
    rating: z.number().int().min(1).max(5),
    review: z.string().optional(),
});

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Content ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, rateSchema);
    if (errorResponse) return errorResponse;

    await libraryService.rateContent(ctx.user!.id, id, data!.rating, data!.review);
    return NextResponse.json({ success: true });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireTenant: true })(req, ctx);
