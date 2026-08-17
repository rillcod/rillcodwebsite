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
 *
 * @deprecated Superseded by the paired markers below, and kept only so that
 * documents issued before them can still be signed. It marks a single point, so
 * stamping *inserted* the signature and left the blank "Name & signature / Date"
 * line and the "Official stamp" box sitting above it — a signed agreement that
 * still showed an empty place to sign. New templates delimit the placeholder
 * instead, so signing replaces it.
 */
export const SIGNATURE_ANCHOR = '<!--SIGNATURE-SLOT-->';

/**
 * The bounds of the placeholder a signature replaces.
 *
 * Everything between these two comments is what an unsigned document shows in
 * the counterparty's box — the ruled line, the name and date captions, the
 * stamp square. Signing swaps the whole region out, so the executed document
 * carries one signature block and no leftover invitation to sign.
 */
export const SIGNATURE_SLOT_START = '<!--SIGNATURE-SLOT-START-->';
export const SIGNATURE_SLOT_END = '<!--SIGNATURE-SLOT-END-->';

/** Whether a rendered document has somewhere for a signature to go. */
export function hasSignatureSlot(html: string): boolean {
  const start = html.indexOf(SIGNATURE_SLOT_START);
  const end = html.indexOf(SIGNATURE_SLOT_END);
  if (start !== -1 && end !== -1 && end > start) return true;
  return html.includes(SIGNATURE_ANCHOR);
}

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
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strict UUID share token validator */
export function isValidShareToken(value: unknown): boolean {
  return typeof value === 'string' && SHARE_TOKEN_PATTERN.test(value.trim());
}

/** Exactly six digits: the short code printed on a document, and a secret. */
export const ACCESS_CODE_PATTERN = /^[0-9]{6}$/;

/**
 * What may address a document publicly.
 *
 * Two things, and both are secrets: the share token in the link we send, and the
 * six-digit access code printed on the page for somebody typing it in.
 *
 * The reference is deliberately not one of them. `RC-PROP-2026-00001` is
 * sequential — the counter migration guarantees it — and printed on the face of
 * every document, so accepting it here means one proposal in one school's hands
 * unlocks every other: count downwards and read their agreed fees, or sign an
 * MoU in a school's name. It is an identifier for people to quote at each other,
 * never a credential.
 *
 * Six digits is a small space, so the routes that accept it rate-limit. The
 * token carries the real entropy.
 */
export function isValidDocumentIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  return SHARE_TOKEN_PATTERN.test(t) || ACCESS_CODE_PATTERN.test(t);
}

/**
 * The public link to a document, or nothing.
 *
 * Every caller that has built this URL by hand has eventually reached for
 * `reference || share_token`, because a reference is always there and a token
 * can be null — and that expression silently produces the one URL that must
 * never be sent. It has happened in the follow-up email and in both WhatsApp
 * buttons. So the construction lives here, takes only the token, and returns
 * null when there isn't one.
 *
 * A null means there is no safe link, and the caller should say so or offer
 * nothing — never fall back to the reference, which the public route does not
 * honour anyway, so the "link" would be dead as well as guessable.
 */
export function buildDocumentShareUrl(
  origin: string,
  shareToken: string | null | undefined,
): string | null {
  const path = documentSharePath(shareToken);
  return path ? `${String(origin).replace(/\/$/, '')}${path}` : null;
}

/**
 * The same link without an origin, for anywhere inside the app.
 *
 * A component that builds an absolute URL has to read `window.location` during
 * render, which is null on the server and a string in the browser — a hydration
 * mismatch for a link that never needed a host in the first place. Absolute URLs
 * are for what leaves the building: email, WhatsApp, a printed QR.
 */
export function documentSharePath(shareToken: string | null | undefined): string | null {
  if (!isValidShareToken(shareToken)) return null;
  return `/p/${String(shareToken).trim()}`;
}

/** Public URL only when the school is allowed to open it (sent or signed). */
export function publicDocumentSharePath(
  shareToken: string | null | undefined,
  status: string | null | undefined,
): string | null {
  if (publicReadAccess(status) !== 'ok') return null;
  return documentSharePath(shareToken);
}

export type SignatureStampInput = {
  signatoryName: string;
  signatoryRole: string;
  signatureDataUrl: string;
  signedAt: string;
  /**
   * The party the signatory affirmed authority to bind.
   *
   * The signing dialogue asks them to confirm they are duly authorised, and
   * that confirmation used to live only in a checkbox in a browser: it was
   * never sent, never stored and never printed. The signature block recorded
   * who signed and when, but not the one fact most likely to be contested
   * later — that they said they had the authority to.
   *
   * Printed here, it goes into the document itself, which the database freezes
   * on signing. Omitted when the school is unknown, rather than asserting a
   * declaration nobody made.
   */
  boundParty?: string | null;
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

  const declaration = input.boundParty
    ? `
        <div style="font-size:7pt; color:#15803d; margin-top:1.8mm; padding-top:1.8mm; border-top:1px solid #bbf7d0; line-height:1.45;">
          Confirmed on signing: the signatory is duly authorised to enter into this
          agreement on behalf of ${escapeHtml(input.boundParty)}, that the details
          above are correct, and that this electronic signature is legally binding.
        </div>`
    : '';

  return `
      <div class="e-signature-stamp" style="margin-top:4mm; padding:3mm; border:1px solid #16a34a; background:#f0fdf4; border-radius:4px;">
        <div style="font-size:8pt; text-transform:uppercase; color:#16a34a; font-weight:700;">Digitally Signed &amp; Accepted</div>
        <img src="${escapeHtml(input.signatureDataUrl)}" alt="Signature" style="max-height:18mm; display:block; margin:2mm 0;" />
        <div style="font-size:8.5pt; font-weight:700; color:#0f172a;">${escapeHtml(input.signatoryName)}</div>
        <div style="font-size:7.5pt; color:#64748b;">${escapeHtml(input.signatoryRole)} &middot; ${escapeHtml(dateLabel)}</div>${declaration}
      </div>`;
}

/**
 * Put the stamp where the document left room for it.
 *
 * The placeholder is *replaced*, not written around. A single-point anchor left
 * the blank ruled line and the "Official stamp" square in place and pushed the
 * signature underneath them, so an executed agreement showed a completed
 * signature directly below an empty invitation to sign — which reads, on a
 * printed contract, as though it was never signed at all.
 *
 * Documents issued before the paired markers still carry the old single anchor,
 * and they must remain signable, so that form is still honoured.
 *
 * Returns null when there is nowhere to sign, so the caller can refuse rather
 * than record a signature nobody can see.
 */
export function stampSignature(html: string, stamp: string): string | null {
  const start = html.indexOf(SIGNATURE_SLOT_START);
  const end = html.indexOf(SIGNATURE_SLOT_END);
  if (start !== -1 && end !== -1 && end > start) {
    return html.slice(0, start) + stamp + html.slice(end + SIGNATURE_SLOT_END.length);
  }
  if (html.includes(SIGNATURE_ANCHOR)) return html.replace(SIGNATURE_ANCHOR, stamp);
  return null;
}

/**
 * Whether an unauthenticated reader may see this document.
 *
 * Drafts have a share token from the moment of issue, but they have not left
 * the building. Serving them on the public link made "draft" a label rather
 * than a gate. Void and declined are withdrawn: the reader is not wrong to
 * have the link, but the offer is no longer current.
 */
export function publicReadAccess(
  status: string | null | undefined,
): 'ok' | 'withdrawn' | 'not_found' {
  const s = String(status || '');
  if (s === 'sent' || s === 'signed') return 'ok';
  if (s === 'void' || s === 'declined') return 'withdrawn';
  return 'not_found';
}

export type PublicSignRefusal = {
  error: string;
  status: number;
  expired?: boolean;
};

/**
 * Why a public (or admin-recorded) signature must not land.
 *
 * A proposal is an offer, not a contract. A draft has not been sent. A lapsed
 * quote must not bind a rate we no longer offer. The UI already hid the button
 * for proposals; the API did not, so a POST executed a quote as an MoU.
 */
export function publicSignRefusal(
  doc: {
    document_kind?: string | null;
    status?: string | null;
    expired?: boolean;
  },
  opts?: { audience?: 'public' | 'admin' },
): PublicSignRefusal | null {
  if (String(doc.document_kind) !== 'mou') {
    return {
      error:
        'This is a proposal, not an agreement. Signing happens on the Memorandum of Understanding issued after terms are agreed.',
      status: 409,
    };
  }
  if (String(doc.status) === 'signed') {
    return { error: 'This document has already been signed.', status: 409 };
  }
  const access = publicReadAccess(doc.status);
  if (access === 'not_found') {
    if (opts?.audience === 'admin') {
      return {
        error:
          'This document has not been sent. Send it, or mark it sent, before recording a signature.',
        status: 409,
      };
    }
    return { error: 'Document not found.', status: 404 };
  }
  if (access === 'withdrawn') {
    return {
      error: `Cannot sign document with status ${doc.status}.`,
      status: 409,
    };
  }
  if (doc.expired) {
    return {
      error:
        'The fees in this proposal have lapsed, so it can no longer be signed. Please contact us and we will re-issue it at current rates.',
      status: 409,
      expired: true,
    };
  }
  return null;
}

/** The authority checkbox must arrive as an explicit true, not a present field. */
export function isAffirmedAuthorised(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Stamp used when an admin records a signature taken on paper.
 *
 * There is no drawn image. The document still has to show that it was executed,
 * with the name, role and date, or the row says signed while the page still
 * invites a signature.
 */
export function buildRecordedSignatureStamp(input: {
  signatoryName: string;
  signatoryRole: string;
  signedAt: string;
  boundParty?: string | null;
}): string {
  const dateLabel = new Date(input.signedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const declaration = input.boundParty
    ? `
        <div style="font-size:7pt; color:#15803d; margin-top:1.8mm; padding-top:1.8mm; border-top:1px solid #bbf7d0; line-height:1.45;">
          Recorded by Rillcod: the signatory executed this agreement on behalf of
          ${escapeHtml(input.boundParty)}.
        </div>`
    : '';
  return `
      <div class="e-signature-stamp" style="margin-top:4mm; padding:3mm; border:1px solid #16a34a; background:#f0fdf4; border-radius:4px;">
        <div style="font-size:8pt; text-transform:uppercase; color:#16a34a; font-weight:700;">Signed in person &amp; recorded</div>
        <div style="font-size:8.5pt; font-weight:700; color:#0f172a;">${escapeHtml(input.signatoryName)}</div>
        <div style="font-size:7.5pt; color:#64748b;">${escapeHtml(input.signatoryRole)} &middot; ${escapeHtml(dateLabel)}</div>${declaration}
      </div>`;
}
