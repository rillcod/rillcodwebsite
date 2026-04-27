import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/config/env';
import { createClient } from '@/lib/supabase/server';

export class StorageService {
    private s3: S3Client | null = null;

    constructor() {
        if (env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
            this.s3 = new S3Client({
                region: 'auto',
                endpoint: env.R2_ENDPOINT,
                credentials: {
                    accessKeyId: env.R2_ACCESS_KEY_ID,
                    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
                },
            });
        }
    }

    async uploadFile(bucket: string, key: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
        if (this.s3 && env.R2_BUCKET_NAME) {
            await this.s3.send(new PutObjectCommand({
                Bucket: env.R2_BUCKET_NAME,
                Key: `${bucket}/${key}`,
                Body: body,
                ContentType: contentType,
            }));
            // For R2, we assume a public URL or we generate signed URLs.
            // Returning the path to be used for signed URLs later.
            return `${bucket}/${key}`;
        }

        // Fallback to Supabase Storage
        const supabase = await createClient();
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(key, body, {
                contentType,
                upsert: true,
            });

        if (error) throw error;
        return data.path;
    }

    async getDownloadUrl(bucket: string, key: string): Promise<string> {
        if (this.s3 && env.R2_BUCKET_NAME) {
            // Use the stable media proxy instead of a short-lived signed URL directly.
            // The proxy handles auth and redirects to a signed URL.
            const fullKey = key.includes('/') ? key : `${bucket}/${key}`;
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
            return `${baseUrl}/api/media/${fullKey}`;
        }

        // Fallback to Supabase Storage
        const supabase = await createClient();
        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(key, 3600 * 24 * 7);

        if (error) throw error;
        return data.signedUrl;
    }
}

export const storageService = new StorageService();
