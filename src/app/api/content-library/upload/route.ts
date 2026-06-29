import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { filesService } from '@/services/files.service';
import { AppError, ValidationError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user || !['admin', 'teacher'].includes(ctx.user.role)) {
        throw new AppError('Only teachers and admins can upload library files', 403, true);
    }

    const formData = await req.formData().catch(() => {
        throw new ValidationError('Invalid form data format. Use multipart/form-data.');
    });

    const file = formData.get('file') as File | null;
    if (!file) throw new ValidationError('No file provided in the request');

    const tenantId = ctx.user.role === 'admin' ? undefined : ctx.user.tenantId;
    if (ctx.user.role === 'teacher' && !tenantId) {
        throw new AppError('Teacher uploads must be linked to a school.', 403, true);
    }

    const uploaded = await filesService.uploadFile(file, ctx.user.id, tenantId);
    return NextResponse.json({ success: true, data: uploaded }, { status: 201 });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, {
    requireAuth: true,
    requireTenant: false,
    roles: ['admin', 'teacher'],
})(req, ctx);
