// Local QR generation for card printing. QR codes are rendered on-device as
// PNG data URLs (works offline, nothing leaks to third parties). If local
// generation ever fails, we fall back to the previous external QR service so
// a card never prints with a blank QR square.

import QRCode from 'qrcode';

export function externalQrUrl(data: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&data=${encodeURIComponent(data)}`;
}

export async function qrDataUrl(data: string, size = 200): Promise<string> {
  try {
    return await QRCode.toDataURL(data, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#ffffff' },
    });
  } catch {
    return externalQrUrl(data, size);
  }
}

/** Generate QR images for many payloads at once (bulk card printing). */
export async function qrDataUrls(payloads: string[], size = 200): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(payloads.map(async p => {
    out.set(p, await qrDataUrl(p, size));
  }));
  return out;
}
