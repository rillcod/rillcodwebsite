import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { filesService } from '@/services/files.service';
import { AppError, ValidationError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    // Students can upload (e.g. assignment photo submissions); library uploads are role-gated at the content-library layer
    if (!ctx.user) {
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

    // Req 17.5 — server-side MIME type + size validation
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        const err = new ValidationError(`File type "${file.type}" is not allowed. Accepted: JPEG, PNG, WebP, PDF.`);
        (err as any).field = 'file';
        throw err;
    }
    if (file.size > MAX_SIZE) {
        const err = new ValidationError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
        (err as any).field = 'file';
        throw err;
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
