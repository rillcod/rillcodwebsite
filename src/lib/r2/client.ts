import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    PutBucketCorsCommand,
    HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? 'rillcod-assests';

let _client: S3Client | null = null;

export function getR2Client(): S3Client {
    if (!_client) {
        _client = new S3Client({
            region: 'auto',
            endpoint: R2_ENDPOINT,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
        });
    }
    return _client;
}

/** Upload a file buffer to R2. Returns the storage key. */
export async function r2Upload(
    key: string,
    body: Buffer | Uint8Array,
    mimeType: string,
    cacheControl = 'public, max-age=31536000'
): Promise<string> {
    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: body,
            ContentType: mimeType,
            CacheControl: cacheControl,
        })
    );
    return key;
}

/**
 * Generate a pre-signed GET URL (default 1 hour).
 * Pass `downloadFilename` to force the browser to save the file instead of opening it.
 */
export async function r2SignedUrl(
    key: string,
    expiresInSeconds = 3600,
    downloadFilename?: string
): Promise<string> {
    const client = getR2Client();
    const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ...(downloadFilename && {
            ResponseContentDisposition: `attachment; filename="${downloadFilename}"`,
        }),
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/** Delete a file from R2. */
export async function r2Delete(key: string): Promise<void> {
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

const APP_ORIGINS = [
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'http://localhost:3000',
].filter(Boolean);

let _r2Ready = false;

/**
 * Run once at server startup (via instrumentation.ts).
 * - Confirms the bucket is reachable.
 * - Applies the CORS policy so browser uploads and the media proxy work.
 */
export async function ensureR2Ready(): Promise<void> {
    if (_r2Ready) return;
    const client = getR2Client();

    // 1. Confirm bucket is reachable
    try {
        await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET }));
    } catch (err) {
        console.error('[R2] Bucket not reachable:', err);
        return;
    }

    // 2. Apply CORS policy
    try {
        await client.send(
            new PutBucketCorsCommand({
                Bucket: R2_BUCKET,
                CORSConfiguration: {
                    CORSRules: [
                        {
                            AllowedOrigins: APP_ORIGINS,
                            AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD', 'DELETE'],
                            AllowedHeaders: ['Content-Type', 'Content-Length', 'Authorization'],
                            ExposeHeaders: ['ETag'],
                            MaxAgeSeconds: 3600,
                        },
                    ],
                },
            })
        );
        console.log('[R2] Ready — bucket reachable, CORS applied.');
    } catch (err) {
        console.warn('[R2] CORS apply failed (may need manual setup):', err);
    }

    _r2Ready = true;
}

/** Check if a key exists in R2. */
export async function r2Exists(key: string): Promise<boolean> {
    const client = getR2Client();
    try {
        await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        return true;
    } catch {
        return false;
    }
}
