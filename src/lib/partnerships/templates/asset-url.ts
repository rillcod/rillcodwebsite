import { brandContact } from '@/config/brand';

/**
 * Clean URL for an image inside a stored or previewed document.
 *
 * Handles raw paths, pre-encoded paths, and avoids double-encoding spaces.
 * Returns root-relative URLs so they resolve seamlessly in srcdoc iframes,
 * browser preview, PDF export, and across local / staging / production hosts.
 */
export function assetUrl(src: string): string {
  if (!src) return '';
  if (/^data:/i.test(src)) return src;

  // Preserve external CDN URLs (e.g. Cloudinary)
  if (/^https?:\/\//i.test(src)) {
    if (!src.includes('rillcod.com')) return src;
    try {
      const url = new URL(src);
      src = url.pathname;
    } catch {
      return src;
    }
  }

  // Remove leading slashes and optional 'public/' prefix
  const cleanPath = String(src).replace(/^\/?(public\/)?/, '');
  const encoded = cleanPath
    .split('/')
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join('/');

  return `/${encoded}`;
}

