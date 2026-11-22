import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { filesService } from '@/services/files.service';
import { AppError, ValidationError } from '@/lib/errors';
import { buildUploadReceipt, validateAllowedUploadSignature } from '@/lib/files/upload-safety';
import { extractStoragePathFromMediaUrl } from '@/lib/files/compress-student-image';
import { r2Delete } from '@/lib/r2/client';

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

    const signatureError = validateAllowedUploadSignature({
        filename: file.name,
        mimeType: file.type,
        bytes: new Uint8Array(await file.slice(0, 16).arrayBuffer()),
    });
    if (signatureError) {
        const err = new ValidationError(signatureError);
        (err as any).field = 'file';
        throw err;
    }

    // Handle standard small-file upload
    const fileData = await filesService.uploadFile(file, ctx.user!.id, ctx.user?.tenantId);
    return NextResponse.json({
        success: true,
        data: {
            ...fileData,
            receipt: buildUploadReceipt(fileData),
        },
        message: 'File uploaded successfully'
    }, { status: 201 });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user) {
        throw new AppError('Not authorized to delete files', 403, true);
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    const rawPath = typeof body?.storagePath === 'string' ? body.storagePath.trim() : '';
    const storagePath = rawPath || extractStoragePathFromMediaUrl(rawUrl) || '';

    if (!storagePath || storagePath.includes('..')) {
        throw new ValidationError('A valid file url or storagePath is required');
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: rows } = await admin
        .from('files')
        .select('id, uploaded_by, storage_path')
        .eq('storage_path', storagePath);

    const isStaff = ['admin', 'teacher'].includes(String(ctx.user.role ?? '').toLowerCase());
    const matchingRows = rows ?? [];
    const ownedRows = matchingRows.filter((r: any) => r.uploaded_by === ctx.user!.id);

    if (!isStaff && ownedRows.length === 0) {
        throw new AppError('You can only delete files you uploaded', 403, true);
    }

    const idsToDelete = (isStaff ? matchingRows : ownedRows).map((r: any) => r.id);
    if (idsToDelete.length > 0) {
        await admin.from('files').delete().in('id', idsToDelete);
    }

    // Only purge R2 object if no other file row still references the same storage_path
    const { count: remainingRefs } = await admin
        .from('files')
        .select('id', { count: 'exact', head: true })
        .eq('storage_path', storagePath);

    let purgedFromStorage = false;
    if (!remainingRefs || remainingRefs === 0) {
        await r2Delete(storagePath).catch(() => {});
        purgedFromStorage = true;
    }

    return NextResponse.json({
        success: true,
        data: { storagePath, purgedFromStorage, deletedRecords: idsToDelete.length },
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler, { requireAuth: true, requireTenant: false })(req, ctx);
