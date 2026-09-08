// Local QR generation for card printing. QR codes are rendered on-device as
// PNG data URLs (works offline, nothing leaks to third parties). If local
// generation ever fails, we fall back to the external QR service so
// a card never prints with a blank QR square.

import {
  externalQrUrl,
  HD_QR_OPTIONS,
  HD_QR_DISPLAY_PX,
  HD_QR_EMBED_PX,
  HD_QR_PRINT_PX,
  qrToDataUrl,
} from '@/lib/qr/hd-qr';

export { externalQrUrl };

/** High-res PNG data URL — default 1024px for sharp print even when CSS-scaled down. */
export async function qrDataUrl(data: string, size = HD_QR_PRINT_PX): Promise<string> {
  try {
    return await qrToDataUrl(data, Math.max(size, HD_QR_EMBED_PX));
  } catch {
    return externalQrUrl(data, Math.max(size, HD_QR_PRINT_PX));
  }
}

/** On-screen preview only — lighter weight than print assets. */
export async function qrDisplayDataUrl(data: string, size = HD_QR_DISPLAY_PX): Promise<string> {
  return qrDataUrl(data, Math.max(size, HD_QR_DISPLAY_PX));
}

/** Bound expensive bitmap work and yield between batches so mobile can paint progress. */
export async function qrDataUrls(
  payloads: string[],
  size = HD_QR_PRINT_PX,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(payloads)];
  onProgress?.(0, unique.length);
  for (let start = 0; start < unique.length; start += 4) {
    // A macrotask boundary also lets the preparation window render before the first batch.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const batch = unique.slice(start, start + 4);
    const results = await Promise.all(batch.map(async p => [p, await qrDataUrl(p, size)] as const));
    results.forEach(([payload, url]) => out.set(payload, url));
    onProgress?.(out.size, unique.length);
  }
  return out;
}

/** @deprecated Use HD_QR_OPTIONS from @/lib/qr/hd-qr */
export const LEGACY_QR_DEFAULTS = HD_QR_OPTIONS;
