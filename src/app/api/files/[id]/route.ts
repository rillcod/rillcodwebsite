import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { filesService } from '@/services/files.service';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('File ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await filesService.getFileMetadata(id, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to delete files', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('File ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    await filesService.deleteFile(id, tenantId);

    return NextResponse.json({
        success: true,
        message: 'File deleted successfully'
    });
}

async function patchHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to replace files', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('File ID missing', 400);

    const formData = await req.formData().catch(() => {
        throw new AppError('Expected multipart/form-data', 400);
    });

    const file = formData.get('file') as File | null;
    if (!file) throw new AppError('No file provided', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await filesService.replaceFile(id, file, ctx.user!.id, tenantId);

    return NextResponse.json({ success: true, data });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const PATCH = (req: any, ctx: any) => withApiProxy(patchHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler, { requireAuth: true, requireTenant: false })(req, ctx);
