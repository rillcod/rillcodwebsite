/**
 * Client-side file validation and image compression.
 * Run this before any upload API call to reject bad files early and
 * reduce storage costs by compressing images.
 *
 * Pipeline (Req 17):
 *  1. If image MIME → compress via Canvas API (max 1200 px wide, quality 0.75)
 *  2. Validate MIME type ∈ ALLOWED_MIME_TYPES
 *  3. Validate compressed size ≤ MAX_FILE_SIZE_BYTES (10 MB)
 *  4. PDF bypasses compression, goes straight to step 2–3
 */

import { ValidationError } from '@/lib/errors';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_WIDTH = 1200;
const IMAGE_QUALITY = 0.75;

function isImageMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
}

/**
 * Compresses an image File to max 1200 px width at quality 0.75 using the
 * browser Canvas API. Returns a new File with the compressed bytes.
 */
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { naturalWidth, naturalHeight } = img;
      const scale = naturalWidth > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / naturalWidth : 1;
      const width = Math.round(naturalWidth * scale);
      const height = Math.round(naturalHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new ValidationError('Canvas context unavailable for image compression'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new ValidationError('Image compression failed'));
            return;
          }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        },
        'image/jpeg',
        IMAGE_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ValidationError('Failed to load image for compression'));
    };

    img.src = url;
  });
}

/**
 * Validates and (for images) compresses a file before upload.
 *
 * @throws {ValidationError} with a `field` property when validation fails.
 * @returns The (possibly compressed) File ready for upload.
 */
export async function validateAndCompressFile(file: File, fieldName = 'file'): Promise<File> {
  let processed = file;

  // Step 1 — compress images first so a large image that shrinks below 10 MB is accepted
  if (isImageMime(file.type)) {
    processed = await compressImage(file);
  }

  // Step 2 — MIME type check (after compression, output is always image/jpeg for images)
  const mimeToCheck = isImageMime(file.type) ? 'image/jpeg' : file.type;
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeToCheck)) {
    const err = new ValidationError(
      `File type "${file.type}" is not allowed. Accepted types: JPEG, PNG, WebP, PDF.`,
    );
    (err as any).field = fieldName;
    throw err;
  }

  // Step 3 — size check on the processed file
  if (processed.size > MAX_FILE_SIZE_BYTES) {
    const err = new ValidationError(
      `File is too large (${(processed.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`,
    );
    (err as any).field = fieldName;
    throw err;
  }

  return processed;
}
