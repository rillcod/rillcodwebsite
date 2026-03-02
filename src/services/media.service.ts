import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { AppError } from '@/lib/errors';

export class MediaService {
    /**
     * Generates a thumbnail for image files within 30 seconds
     * Re-uses the primary file storage
     */
    async generateThumbnail(fileData: any, storagePath: string, buffer: Buffer) {
        // Only process images
        if (!['jpg', 'jpeg', 'png', 'webp'].includes(fileData.file_type.toLowerCase())) {
            return null;
        }

        try {
            const thumbnailBuffer = await sharp(buffer)
                .resize({ width: 400, height: 400, fit: 'inside' })
                .toFormat('jpeg', { quality: 80 })
                .toBuffer();

            const ext = 'jpg';
            const rawName = fileData.filename.split('.')[0];
            const thumbStoragePath = `${storagePath.split('/').slice(0, -1).join('/')}/thumb_${rawName}.${ext}`;

            const supabase = await createClient();

            const { error: uploadError } = await supabase.storage
                .from('lms-files')
                .upload(thumbStoragePath, thumbnailBuffer, {
                    contentType: 'image/jpeg',
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data: publicUrlData } = supabase.storage
                .from('lms-files')
                .getPublicUrl(thumbStoragePath);

            // Update the file metadata to include the thumbnail URL
            await supabase
                .from('files')
                .update({ thumbnail_url: publicUrlData.publicUrl })
                .eq('id', fileData.id);

            return publicUrlData.publicUrl;
        } catch (err) {
            console.error('Failed to generate thumbnail:', err);
            return null;
        }
    }

    /**
     * Mock of a Video Processing service.
     * In a real-world scenario, this would likely trigger an AWS Elemental MediaConvert job or FFmpeg process.
     */
    async processVideo(fileData: any, storagePath: string) {
        if (!['mp4', 'webm', 'mov'].includes(fileData.file_type.toLowerCase())) {
            return null;
        }

        const supabase = await createClient();

        // Mock transcoded URLs
        const transcodedMetadata = {
            resolutions: {
                '360p': `${storagePath}-360p.mp4`,
                '720p': `${storagePath}-720p.mp4`,
                '1080p': `${storagePath}-1080p.mp4`
            },
            processing_status: 'completed'
        };

        // Update file metadata with transcoded video locations
        let currentMetadata = fileData.metadata || {};
        const updatedMetadata = { ...currentMetadata, video_processing: transcodedMetadata };

        await supabase
            .from('files')
            .update({ metadata: updatedMetadata })
            .eq('id', fileData.id);

        return transcodedMetadata;
    }
}

export const mediaService = new MediaService();
