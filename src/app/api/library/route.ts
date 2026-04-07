import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { libraryService } from '@/services/library.service';
import { AppError } from '@/lib/errors';

async function listHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const tag = searchParams.get('tag');
    const query = searchParams.get('query');
    const subject = searchParams.get('subject');
    const gradeLevel = searchParams.get('gradeLevel');
    const sort = searchParams.get('sort') as any;
    const order = searchParams.get('order') as any;

    const items = await libraryService.listContent(ctx.user!.tenantId!, {
        type: type as any,
        tag,
        query,
        subject,
        gradeLevel,
        sort,
        order
    });
    return NextResponse.json({ success: true, data: items });
}

async function postHandler(req: Request, ctx: ApiContext) {
    // Only admin and teacher can upload content
    if (!['admin', 'teacher'].includes(ctx.user!.role)) {
        return NextResponse.json({ error: 'Only teachers and admins can upload content' }, { status: 403 });
    }

    const body = await req.json();
    // Admin uploads as global (school_id = null); teacher scoped to their school
    const tenantId = ctx.user!.role === 'admin' ? null : ctx.user!.tenantId!;
    const item = await libraryService.createContent(tenantId, ctx.user!.id, ctx.user!.role, body);
    return NextResponse.json({ success: true, data: item });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler, { requireTenant: true })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireTenant: true })(req, ctx);
