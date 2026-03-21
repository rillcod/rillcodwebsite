import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { mediaService } from './media.service';
import crypto from 'crypto';

const BUCKET_NAME = 'lms-files';

/** Ensures the storage bucket exists, creating it if not. Uses admin client. */
async function ensureBucket() {
    const admin = createAdminClient();
    const { data: buckets } = await admin.storage.listBuckets();
    const exists = (buckets ?? []).some(b => b.name === BUCKET_NAME);
    if (!exists) {
        const { error } = await admin.storage.createBucket(BUCKET_NAME, {
            public: false,
        });
        if (error && !error.message.includes('already exists')) {
            throw new AppError(`Failed to create storage bucket: ${error.message}`, 500);
        }
    }
}

export interface FileMetadata {
    filename: string;
    original_filename: string;
    file_type: string;
    file_size: number;
    mime_type: string;
    school_id?: string;
}

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'mp4', 'mp3', 'jpg', 'jpeg', 'png', 'zip'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — Supabase free-tier limit

export class FilesService {
    private getStorageProvider() {
        // using Supabase Storage as the 's3' abstraction 
        return 's3';
    }

    // Task 15.1: Validate file type and size
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

        // Task 17.1: Deduplication hash
        let fileHash = '';
        try {
            fileHash = await this.calculateHash(file);
        } catch (e) {
            console.error('Failed to hash file', e);
        }

        if (fileHash) {
            // Check for existing files with same hash before uploading
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
                        filename: existing.filename, // Maintain the same underlying filename
                        original_filename: file.name,
                        file_type: existing.file_type,
                        file_size: existing.file_size,
                        mime_type: existing.mime_type,
                        storage_path: existing.storage_path, // Maintain original storage path!
                        storage_provider: existing.storage_provider,
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

        // Ensure bucket exists before uploading
        await ensureBucket();

        // Upload to Supabase Storage (which acts as our S3 bucket)
        const { error: storageError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (storageError) {
            throw new AppError(`Failed to upload file to storage: ${storageError.message}`, 500);
        }

        // Task 15.3: Mock Virus Scanning Interaction
        let isVirusScanned = true;
        let virusScanResult = 'clean';

        // Insert metadata into files table
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
                storage_provider: this.getStorageProvider(),
                is_virus_scanned: isVirusScanned,
                virus_scan_result: virusScanResult,
                metadata: fileHash ? { file_hash: fileHash } : {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (dbError) {
            // Cleanup storage if db insert fails
            await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
            throw new AppError(`Failed to save file metadata: ${dbError.message}`, 500);
        }

        // Run post tools (Media Processing Tasks 16.1 & 16.2) asynchronously without hanging the upload process
        (async () => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                await mediaService.generateThumbnail(fileData, storagePath, buffer);
                await mediaService.processVideo(fileData, storagePath);
            } catch (err) {
                console.error('Post processing failed', err);
            }
        })();

        return fileData;
    }

    // Start resumable multipart upload (Task 15.2) by creating a signed upload URL
    async createResumableUpload(filename: string, size: number, mimeType: string, uploaderId: string, tenantId?: string) {
        const supabase = await createClient();
        this.validateFile(filename, size);

        const ext = filename.split('.').pop();
        const uniqueFilename = `${crypto.randomUUID()}.${ext}`;
        const storagePath = tenantId ? `${tenantId}/${uniqueFilename}` : `global/${uniqueFilename}`;

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUploadUrl(storagePath);

        if (error || !data) {
            throw new AppError(`Failed to initiate resumable upload: ${error?.message}`, 500);
        }

        return {
            signedUrl: data.signedUrl,
            token: data.token,
            path: data.path,
            originalFilename: filename,
            mimeType,
            size
        };
    }

    // Completes the resumable upload process by saving to DB once upload is finished
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
                storage_provider: this.getStorageProvider(),
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

    // Task 15.4: Generate Signed URL for secure downloads
    async generateSignedUrl(id: string, expiresInSeconds: number = 3600, tenantId?: string) {
        const supabase = await createClient();
        const fileData = await this.getFileMetadata(id, tenantId);

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(fileData.storage_path, expiresInSeconds);

        if (error || !data) {
            throw new AppError(`Failed to generate signed URL: ${error?.message}`, 500);
        }

        // Increment download count securely
        await supabase.rpc('increment_download_count', { file_id: id });

        return {
            file_id: id,
            signedUrl: data.signedUrl,
            expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
        };
    }

    // Cleanup/Delete
    async deleteFile(id: string, tenantId?: string) {
        const supabase = await createClient();
        const fileData = await this.getFileMetadata(id, tenantId);

        const { error: storageError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([fileData.storage_path]);

        if (storageError) {
            throw new AppError(`Failed to delete file from storage: ${storageError.message}`, 500);
        }

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
