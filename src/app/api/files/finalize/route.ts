import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { filesService } from '@/services/files.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized', 403, true);
    }

    const body = await req.json();
    const fileData = await filesService.finalizeResumableUpload(body, ctx.user!.id, ctx.user?.tenantId);

    return NextResponse.json({ success: true, data: fileData }, { status: 201 });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
