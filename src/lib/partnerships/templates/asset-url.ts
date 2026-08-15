import { brandContact } from '@/config/brand';

/**
 * Absolute URL for an image inside a stored document.
 *
 * Both templates need this and for the same reason: a document is stored and
 * reopened long after it was issued, previewed inside a srcdoc iframe that has
 * no base to resolve against, emailed, and read back through html-to-image to
 * build the PDF. A relative `/images/...` is a broken frame in three of those
 * four places.
 *
 * Filenames are encoded per segment because photographs arrive from a phone as
 * "WhatsApp Image … (1).jpeg", and a raw space is not a URL.
 */
export function assetUrl(src: string): string {
  if (/^(https?:|data:)/i.test(src)) return src;
  const encoded = String(src)
    .replace(/^\//, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${brandContact.siteUrl.replace(/\/$/, '')}/${encoded}`;
}
