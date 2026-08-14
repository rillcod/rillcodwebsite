/**
 * The rules that make a public signing link safe.
 *
 * Gathered here rather than left inline in the route because two of them are
 * shared with the templates — the anchor the stamp replaces has to be the same
 * string the document prints, and a copy of it in a second file is a silent
 * failure waiting to happen. That is exactly how signing a proposal came to set
 * the status to `signed` and put nothing on the page: the stamp replaced the
 * literal "Official stamp", which only the MoU contains.
 */

/**
 * Where a counter-signature lands.
 *
 * A comment, so it is invisible in an unsigned document and survives the HTML
 * untouched until somebody signs.
 */
export const SIGNATURE_ANCHOR = '<!--SIGNATURE-SLOT-->';

/**
 * A share token, and nothing else.
 *
 * The public routes are keyed on this instead of `reference`, which is
 * sequential per kind per year and printed on the face of every document — so
 * holding one told you the others existed.
 */
export const SHARE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A signature image, and nothing else.
 *
 * This value goes straight into the document's `src`, so anything that is not a
 * base64 raster is refused rather than escaped and drawn.
 */
export const SIGNATURE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/;

/**
 * Cap on the encoded signature.
 *
 * A signature is a few kilobytes of ink. Without a bound this is an
 * unauthenticated write of arbitrary size into a text column and into the
 * contract body itself.
 */
export const MAX_SIGNATURE_BYTES = 512 * 1024;

/** Longest name and role we will print. Trimmed, not rejected. */
export const MAX_SIGNATORY_NAME = 120;
export const MAX_SIGNATORY_ROLE = 80;

/** HTML-escape. The document is a legal record; nothing typed rewrites it. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isValidShareToken(value: unknown): boolean {
  return typeof value === 'string' && SHARE_TOKEN_PATTERN.test(value.trim());
}

export type SignatureStampInput = {
  signatoryName: string;
  signatoryRole: string;
  signatureDataUrl: string;
  signedAt: string;
};

/**
 * The block stamped into the document when somebody signs.
 *
 * Every interpolated value is escaped. An unauthenticated caller must not be
 * able to close an attribute and rewrite the visible content of a contract —
 * the sandboxed preview stops a script running, but it does not stop the page
 * being made to say something else, and this HTML is also emailed and printed.
 */
export function buildSignatureStamp(input: SignatureStampInput): string {
  const dateLabel = new Date(input.signedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `
      <div class="e-signature-stamp" style="margin-top:4mm; padding:3mm; border:1px solid #16a34a; background:#f0fdf4; border-radius:4px;">
        <div style="font-size:8pt; text-transform:uppercase; color:#16a34a; font-weight:700;">Digitally Signed &amp; Accepted</div>
        <img src="${escapeHtml(input.signatureDataUrl)}" alt="Signature" style="max-height:18mm; display:block; margin:2mm 0;" />
        <div style="font-size:8.5pt; font-weight:700; color:#0f172a;">${escapeHtml(input.signatoryName)}</div>
        <div style="font-size:7.5pt; color:#64748b;">${escapeHtml(input.signatoryRole)} &middot; ${escapeHtml(dateLabel)}</div>
      </div>`;
}

/**
 * Put the stamp where the document left room for it.
 *
 * Returns null when there is no anchor, so the caller can refuse rather than
 * record a signature nobody can see.
 */
export function stampSignature(html: string, stamp: string): string | null {
  if (!html.includes(SIGNATURE_ANCHOR)) return null;
  return html.replace(SIGNATURE_ANCHOR, stamp);
}
