/**
 * Smart client-side image compressor for student work photos (CBT essays,
 * assignments, AI document scans).
 *
 * Drastically reduces phone camera photos (often 3–8 MB) down to ~80–180 KB
 * WebP/JPEG while preserving crisp 1280px readability for handwriting,
 * diagrams, and code screenshots.
 */

export interface CompressImageOptions {
  /** Max width or height in px (1280px keeps handwriting & diagrams razor-sharp). */
  maxDimension?: number;
  /** Target byte ceiling for adaptive quality stepping (default 180 KB). */
  targetBytes?: number;
  /** Starting quality (0.1–1.0). Default 0.78. */
  initialQuality?: number;
  /** Lowest quality floor to keep text clearly legible. Default 0.52. */
  minQuality?: number;
}

export async function compressStudentImage(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  if (
    typeof window === 'undefined' ||
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml'
  ) {
    return file;
  }

  const maxDim = options.maxDimension ?? 1280;
  const targetBytes = options.targetBytes ?? 180 * 1024;
  const initialQuality = options.initialQuality ?? 0.78;
  const minQuality = options.minQuality ?? 0.52;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const { naturalWidth: w, naturalHeight: h } = img;
    if (file.size <= targetBytes && w <= maxDim && h <= maxDim) {
      return file;
    }

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // White backing prevents transparent PNGs from turning black in JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP (30–40% smaller than JPEG at identical sharpness); fall back to JPEG if unsupported
    const tryEncode = (mime: 'image/webp' | 'image/jpeg', q: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, q));

    let chosenMime: 'image/webp' | 'image/jpeg' = 'image/webp';
    let bestBlob = await tryEncode('image/webp', initialQuality);
    if (!bestBlob || bestBlob.type !== 'image/webp') {
      chosenMime = 'image/jpeg';
      bestBlob = await tryEncode('image/jpeg', initialQuality);
    }
    if (!bestBlob) return file;

    // Step quality down gently until under targetBytes or reaching minQuality
    let quality = initialQuality;
    while (bestBlob.size > targetBytes && quality - 0.08 >= minQuality) {
      quality = Number((quality - 0.08).toFixed(2));
      const smaller = await tryEncode(chosenMime, quality);
      if (smaller && smaller.size < bestBlob.size) {
        bestBlob = smaller;
      } else {
        break;
      }
    }

    if (bestBlob.size >= file.size) return file;

    const ext = chosenMime === 'image/webp' ? 'webp' : 'jpg';
    const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([bestBlob], `${baseName}.${ext}`, {
      type: chosenMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Extract the R2 storage path from an `/api/media/<storagePath>` URL. */
export function extractStoragePathFromMediaUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/api\/media\/(.+?)(?:[?#].*)?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/^\/+/, '');
  } catch {
    return match[1].replace(/^\/+/, '');
  }
}
