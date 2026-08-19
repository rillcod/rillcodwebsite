import fs from 'node:fs';
import path from 'node:path';
import { brandContact } from '@/config/brand';

/** Inline a PNG as a data URL, trying each candidate path in order. */
export function loadPngDataUrl(candidates: string[]): string | null {
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function loadBrandLogoDataUrl(): string | null {
  return loadPngDataUrl([
    path.join(process.cwd(), 'public', 'images', 'logo.png'),
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), 'logo.png'),
  ]);
}

export function loadOfficialSignatureDataUrl(asset = brandContact.signatureImage): string | null {
  // Strip leading slashes and any traversal segments — the asset path comes from
  // the report policy, which is staff-editable.
  const relative = String(asset || '').replace(/^\/+/, '').replace(/\.\.[/\\]/g, '');
  const fallbackRelative = String(brandContact.signatureImage).replace(/^\/+/, '');
  return loadPngDataUrl([
    path.join(process.cwd(), 'public', relative),
    path.join(process.cwd(), 'public', fallbackRelative),
  ]);
}
