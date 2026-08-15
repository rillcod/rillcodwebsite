import { r2SignedUrl } from '@/lib/r2/client';
import type { SchoolGalleryItem } from './gallery-types';

/** How long a signed media URL stays good. Long enough to watch, short enough to expire. */
export const MEDIA_URL_TTL_SECONDS = 3600;

type GalleryRow = SchoolGalleryItem & { r2_key?: string | null };

/**
 * Turn a stored row into something a browser can actually load.
 *
 * Uploads go to R2 and the row keeps the object key. The URL is signed at read
 * time, which is how billing proofs, CRM attachments and certificates already
 * work here — and the reason it matters is that the gallery originally stored
 * `/api/storage/r2?key=…` as a permanent URL, and no such route exists anywhere
 * in the codebase. Every uploaded photograph and clip was written to the bucket
 * and then addressed by something that 404s.
 *
 * A row with no key came from a pasted external URL, and is passed through.
 */
export async function withSignedUrl<T extends GalleryRow>(row: T): Promise<T> {
  if (!row.r2_key) return row;
  try {
    const signed = await r2SignedUrl(row.r2_key, MEDIA_URL_TTL_SECONDS);
    return { ...row, url: signed, thumbnail_url: signed };
  } catch {
    // A bucket having a bad moment should not empty the gallery; the row still
    // describes the media, and the next read signs it again.
    return row;
  }
}

/** The same, for a list. Signed in parallel — a term's gallery is not one item. */
export async function withSignedUrls<T extends GalleryRow>(rows: T[]): Promise<T[]> {
  return Promise.all(rows.map(withSignedUrl));
}
