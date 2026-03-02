import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { filesService } from '@/services/files.service';
import { AppError, ValidationError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'teacher' && ctx.user?.role !== 'school') {
        throw new AppError('Not authorized to upload files', 403, true);
    }

    const formData = await req.formData().catch(() => {
        throw new ValidationError('Invalid form data format. Use multipart/form-data.');
    });

    const file = formData.get('file') as File | null;
    const isResumable = formData.get('resumable') === 'true';

    if (!file) {
        // Check if initializing resumable directly through metadata keys instead of file
        const filename = formData.get('filename') as string;
        const sizeStr = formData.get('size') as string;
        const mimeType = formData.get('mimeType') as string;

        if (isResumable && filename && sizeStr) {
            const data = await filesService.createResumableUpload(
                filename,
                parseInt(sizeStr, 10),
                mimeType || 'application/octet-stream',
                ctx.user!.id,
                ctx.user?.tenantId
            );
            return NextResponse.json({ success: true, data });
        }

        throw new ValidationError('No file provided in the request');
    }

    // Handle standard small-file upload
    const fileData = await filesService.uploadFile(file, ctx.user!.id, ctx.user?.tenantId);
    return NextResponse.json({
        success: true,
        data: fileData,
        message: 'File uploaded successfully'
    }, { status: 201 });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
