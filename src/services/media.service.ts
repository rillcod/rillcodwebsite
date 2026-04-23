import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

export class MediaService {
    /**
     * Thumbnail generation requires sharp (Node.js native binary).
     * Not supported on Cloudflare Workers edge runtime — returns null silently.
     */
    async generateThumbnail(_fileData: any, _storagePath: string, _buffer: Buffer) {
        return null;
    }

    private async updateMediaMetadata(fileId: string, metadataPatch: Record<string, unknown>) {
        const supabase = await createClient();
        const { data: existing } = await supabase
            .from('files')
            .select('metadata')
            .eq('id', fileId)
            .maybeSingle();

        const currentMetadata =
            existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
                ? existing.metadata as Record<string, unknown>
                : {};

        const nextVideoProcessing =
            metadataPatch.video_processing &&
            typeof metadataPatch.video_processing === 'object' &&
            !Array.isArray(metadataPatch.video_processing)
                ? {
                    ...(currentMetadata.video_processing as Record<string, unknown> | undefined ?? {}),
                    ...(metadataPatch.video_processing as Record<string, unknown>),
                }
                : currentMetadata.video_processing;

        await supabase
            .from('files')
            .update({
                metadata: {
                    ...currentMetadata,
                    ...metadataPatch,
                    ...(nextVideoProcessing ? { video_processing: nextVideoProcessing } : {}),
                } as any,
            })
            .eq('id', fileId);
    }

    /**
     * Mock of a Video Processing service.
     * In a real-world scenario, this would likely trigger an AWS Elemental MediaConvert job or FFmpeg process.
     */
    async processVideo(fileData: any, storagePath: string) {
        if (!['mp4', 'webm', 'mov'].includes(fileData.file_type.toLowerCase())) {
            return null;
        }

        const transcodedMetadata = {
            processing_status: 'pending_external_processor',
            original_storage_path: storagePath,
            generated_assets: [],
            provider: 'unconfigured',
            updated_at: new Date().toISOString(),
        };

        await this.updateMediaMetadata(fileData.id, { video_processing: transcodedMetadata });

        return transcodedMetadata;
    }
}

export const mediaService = new MediaService();
