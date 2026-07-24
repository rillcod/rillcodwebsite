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

/** Generate QR images for many payloads at once (bulk card printing). */
export async function qrDataUrls(payloads: string[], size = HD_QR_PRINT_PX): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(payloads.map(async (p) => {
    out.set(p, await qrDataUrl(p, size));
  }));
  return out;
}

/** @deprecated Use HD_QR_OPTIONS from @/lib/qr/hd-qr */
export const LEGACY_QR_DEFAULTS = HD_QR_OPTIONS;
