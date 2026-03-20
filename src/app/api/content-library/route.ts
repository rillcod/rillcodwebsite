import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { withValidation } from '@/proxies/validation.proxy';
import { libraryService } from '@/services/library.service';

const createContentSchema = z.object({
    title: z.string().min(3),
    description: z.string().optional(),
    contentType: z.enum(['video', 'document', 'quiz', 'presentation', 'interactive']),
    fileId: z.string().uuid().optional().nullable(),
    category: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    subject: z.string().optional().nullable(),
    gradeLevel: z.string().optional().nullable(),
    licenseType: z.string().optional().nullable(),
    attribution: z.string().optional().nullable(),
});

async function listHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as any;
    const tag = searchParams.get('tag');
    const query = searchParams.get('query');
    const subject = searchParams.get('subject');
    const gradeLevel = searchParams.get('gradeLevel');
    const sort = searchParams.get('sort') as any;
    const order = searchParams.get('order') as any;
    const page = parseInt(searchParams.get('page') ?? '0', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const tenantId = ctx.user?.tenantId;

    const items = await libraryService.listContent(tenantId, {
        type,
        tag,
        query,
        subject,
        gradeLevel,
        sort,
        order,
        page,
        pageSize,
        role: ctx.user?.role,
    });

    return NextResponse.json({ success: true, data: items });
}

async function postHandler(req: Request, ctx: ApiContext) {
    const { data, errorResponse } = await withValidation(req as any, createContentSchema);
    if (errorResponse) return errorResponse;

    const item = await libraryService.createContent(ctx.user?.tenantId, ctx.user!.id, ctx.user!.role, data!);
    return NextResponse.json({ success: true, data: item }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireTenant: true })(req, ctx);
