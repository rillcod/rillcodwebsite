import QRCode from 'qrcode';

/** On-screen display — large enough for phone-to-phone scanning. */
export const HD_QR_DISPLAY_PX = 280;

/** Minimum bitmap quality for any generated QR (UI embeds, previews). */
export const HD_QR_EMBED_PX = 512;

/** Default print resolution — ID cards, PDFs, bulk print sheets. */
export const HD_QR_PRINT_PX = 1024;

/** Posters, A4 QR sheets, branded download cards. */
export const HD_QR_PRINT_LARGE_PX = 2048;

/** A5 short edge at 300 DPI. */
export const HD_QR_A5_PX = 1748;

/** 4K square (4096×4096) for large-format print and share downloads. */
export const HD_QR_PRINT_4K_PX = 4096;

/** @deprecated Use HD_QR_PRINT_4K_PX */
export const HD_QR_EXPORT_PX = HD_QR_PRINT_4K_PX;

export const HD_QR_OPTIONS = {
  errorCorrectionLevel: 'H' as const,
  margin: 4,
  color: { dark: '#000000', light: '#FFFFFF' },
};

/** Source pixels for HTML print when the QR displays at `displayPx` on paper. */
export function qrPrintSourcePx(displayPx: number): number {
  return Math.min(
    HD_QR_PRINT_4K_PX,
    Math.max(HD_QR_PRINT_PX, Math.round(displayPx * 8)),
  );
}

export function externalQrUrl(data: string, size = HD_QR_PRINT_PX): string {
  const px = Math.max(size, HD_QR_EMBED_PX);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=4&ecc=H&data=${encodeURIComponent(data)}`;
}

export function externalQrPrintUrl(data: string, displayPx: number): string {
  return externalQrUrl(data, qrPrintSourcePx(displayPx));
}

export async function qrToDataUrl(data: string, width = HD_QR_PRINT_PX): Promise<string> {
  return QRCode.toDataURL(data, {
    ...HD_QR_OPTIONS,
    width: Math.max(width, HD_QR_EMBED_PX),
  });
}

export async function downloadHdQrPng(
  data: string,
  filename: string,
  width = HD_QR_PRINT_4K_PX,
): Promise<void> {
  const url = await qrToDataUrl(data, width);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
