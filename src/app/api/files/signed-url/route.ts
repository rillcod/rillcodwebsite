import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { filesService } from '@/services/files.service';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('file_id');

    if (!fileId) throw new AppError('file_id is required', 400);

    const expiresStr = url.searchParams.get('expires_in');
    const expiresIn = expiresStr ? parseInt(expiresStr, 10) : 3600;

    const tenantId = ctx.user?.tenantId;
    const data = await filesService.generateSignedUrl(fileId, expiresIn, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
