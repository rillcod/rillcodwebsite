import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { mediaService } from './media.service';
import { r2Upload, r2Delete } from '@/lib/r2/client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';
function proxyUrl(storagePath: string) {
    return `${APP_URL}/api/media/${storagePath}`;
}
import crypto from 'crypto';

export interface FileMetadata {
    filename: string;
    original_filename: string;
    file_type: string;
    file_size: number;
    mime_type: string;
    school_id?: string;
}

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'mp4', 'mp3', 'jpg', 'jpeg', 'png', 'zip'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export class FilesService {
    validateFile(filename: string, size: number) {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new ValidationError(`File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`);
        }
        if (size > MAX_FILE_SIZE) {
            throw new ValidationError(`File size exceeds maximum limit of 500MB`);
        }
        return true;
    }

    async calculateHash(file: File): Promise<string> {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    async uploadFile(file: File, uploaderId: string, tenantId?: string) {
        const supabase = await createClient();

        this.validateFile(file.name, file.size);

        // Deduplication: hash before uploading
        let fileHash = '';
        try {
            fileHash = await this.calculateHash(file);
        } catch (e) {
            console.error('Failed to hash file', e);
        }

        if (fileHash) {
            const { data: existingFiles } = await supabase
                .from('files')
                .select('*')
                .eq('metadata->>file_hash', fileHash)
                .limit(1);

            if (existingFiles && existingFiles.length > 0) {
                const existing = existingFiles[0];
                const { data: copyData, error: copyErr } = await supabase
                    .from('files')
                    .insert([{
                        school_id: tenantId,
                        uploaded_by: uploaderId,
                        filename: existing.filename,
                        original_filename: file.name,
                        file_type: existing.file_type,
                        file_size: existing.file_size,
                        mime_type: existing.mime_type,
                        storage_path: existing.storage_path,
                        storage_provider: 's3',
                        is_virus_scanned: existing.is_virus_scanned,
                        virus_scan_result: existing.virus_scan_result,
                        metadata: { file_hash: fileHash, original_id: existing.id, is_duplicate: true },
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }])
                    .select()
                    .single();

                if (copyErr) throw new AppError(`Failed to save file duplicate metadata: ${copyErr.message}`, 500);
                return copyData;
            }
        }

        const ext = file.name.split('.').pop() || '';
        const uniqueFilename = `${crypto.randomUUID()}.${ext}`;
        const storagePath = tenantId ? `${tenantId}/${uniqueFilename}` : `global/${uniqueFilename}`;

        // Upload to Cloudflare R2
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await r2Upload(storagePath, buffer, file.type);

        const { data: fileData, error: dbError } = await supabase
            .from('files')
            .insert([{
                school_id: tenantId,
                uploaded_by: uploaderId,
                filename: uniqueFilename,
                original_filename: file.name,
                file_type: ext.toLowerCase() || 'unknown',
                file_size: file.size,
                mime_type: file.type,
                storage_path: storagePath,
                storage_provider: 'r2',
                public_url: proxyUrl(storagePath),
                is_virus_scanned: true,
                virus_scan_result: 'clean',
                metadata: fileHash ? { file_hash: fileHash } : {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (dbError) {
            // Best-effort cleanup from R2
            await r2Delete(storagePath).catch(() => {});
            throw new AppError(`Failed to save file metadata: ${dbError.message}`, 500);
        }

        // Run post processing asynchronously
        (async () => {
            try {
                await mediaService.generateThumbnail(fileData, storagePath, buffer);
                await mediaService.processVideo(fileData, storagePath);
            } catch (err) {
                console.error('Post processing failed', err);
            }
        })();

        return fileData;
    }

    // Resumable upload: R2 doesn't support TUS protocol directly; we use a pre-signed PUT URL instead
    async createResumableUpload(filename: string, size: number, mimeType: string, uploaderId: string, tenantId?: string) {
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const { getR2Client, R2_BUCKET } = await import('@/lib/r2/client');

        this.validateFile(filename, size);

        const ext = filename.split('.').pop();
        const uniqueFilename = `${crypto.randomUUID()}.${ext}`;
        const storagePath = tenantId ? `${tenantId}/${uniqueFilename}` : `global/${uniqueFilename}`;

        const client = getR2Client();
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: storagePath,
            ContentType: mimeType,
            ContentLength: size,
        });
        const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

        return {
            signedUrl,
            token: storagePath, // used as the identifier when finalizing
            path: storagePath,
            originalFilename: filename,
            mimeType,
            size
        };
    }

    async finalizeResumableUpload(metadata: any, uploaderId: string, tenantId?: string) {
        const supabase = await createClient();

        const { data: fileData, error: dbError } = await supabase
            .from('files')
            .insert([{
                school_id: tenantId,
                uploaded_by: uploaderId,
                filename: metadata.path.split('/').pop(),
                original_filename: metadata.originalFilename,
                file_type: metadata.originalFilename.split('.').pop() || 'unknown',
                file_size: metadata.size,
                mime_type: metadata.mimeType,
                storage_path: metadata.path,
                storage_provider: 'r2',
                public_url: proxyUrl(metadata.path),
                is_virus_scanned: true,
                virus_scan_result: 'clean',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (dbError) {
            throw new AppError(`Failed to wrap up resumable upload metadata: ${dbError.message}`, 500);
        }

        return fileData;
    }

    async getFileMetadata(id: string, tenantId?: string) {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new NotFoundError('File not found');
        }

        if (tenantId && data.school_id && data.school_id !== tenantId) {
            throw new NotFoundError('File not found');
        }

        return data;
    }

    async generateSignedUrl(id: string, expiresInSeconds: number = 3600, tenantId?: string) {
        const supabase = await createClient();
        const fileData = await this.getFileMetadata(id, tenantId);

        // Increment download count
        await supabase.rpc('increment_download_count', { file_id: id });

        // Return the stable proxy URL — works for both web and mobile.
        // The /api/media route validates auth and redirects to a short-lived R2 URL.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
        const proxyUrl = `${appUrl}/api/media/${fileData.storage_path}`;

        return {
            file_id: id,
            signedUrl: proxyUrl,
            expires_at: null, // proxy URL is stable; auth is checked per-request
        };
    }

    /**
     * Replace an existing file in R2 with a new one.
     * Deletes the old R2 object and updates the DB record in place —
     * the file ID stays the same so any content_library / course_materials
     * rows that reference it keep working automatically.
     */
    async replaceFile(id: string, newFile: File, uploaderId: string, tenantId?: string) {
        const supabase = await createClient();
        const existing = await this.getFileMetadata(id, tenantId);

        this.validateFile(newFile.name, newFile.size);

        const ext = newFile.name.split('.').pop() || '';
        const uniqueFilename = `${crypto.randomUUID()}.${ext}`;
        const storagePath = existing.storage_path
            ? existing.storage_path.replace(/[^/]+$/, uniqueFilename) // same folder, new filename
            : (tenantId ? `${tenantId}/${uniqueFilename}` : `global/${uniqueFilename}`);

        // Upload new file first — so we never lose data if upload fails
        const arrayBuffer = await newFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await r2Upload(storagePath, buffer, newFile.type);

        // Delete old R2 object (best-effort — don't fail the whole operation)
        if (existing.storage_path && (existing.storage_provider === 's3' || existing.storage_provider === 'r2')) {
            await r2Delete(existing.storage_path).catch((e) =>
                console.warn('[R2] Could not delete old file during replace:', e)
            );
        }

        const fileHash = await this.calculateHash(newFile).catch(() => '');

        const { data, error } = await supabase
            .from('files')
            .update({
                uploaded_by: uploaderId,
                filename: uniqueFilename,
                original_filename: newFile.name,
                file_type: ext.toLowerCase() || 'unknown',
                file_size: newFile.size,
                mime_type: newFile.type,
                storage_path: storagePath,
                storage_provider: 'r2',
                public_url: proxyUrl(storagePath),
                metadata: fileHash ? { file_hash: fileHash } : {},
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new AppError(`Failed to update file metadata: ${error.message}`, 500);
        return data;
    }

    async deleteFile(id: string, tenantId?: string) {
        const supabase = await createClient();
        const fileData = await this.getFileMetadata(id, tenantId);

        await r2Delete(fileData.storage_path);

        const { error: dbError } = await supabase
            .from('files')
            .delete()
            .eq('id', id);

        if (dbError) {
            throw new AppError(`Failed to delete file metadata: ${dbError.message}`, 400);
        }

        return true;
    }
}

export const filesService = new FilesService();
