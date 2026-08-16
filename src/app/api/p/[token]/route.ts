/**
 * The public face of an issued document: read it, and sign it.
 *
 * Unauthenticated on purpose — the whole point is a link a proprietor opens on
 * a phone from WhatsApp, without an account. What makes that safe is the token.
 *
 * It was keyed on `reference`, which is sequential per kind per year and printed
 * on the face of the document. Anyone holding RC-PROP-2026-00042 could count
 * downwards and read every school's agreed fees, or sign an MOU in a school's
 * name they had never been sent. `share_token` is a random uuid that exists only
 * in the link, and is rotatable, so a link forwarded to the wrong group can be
 * revoked without touching the contract.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import {
  MAX_SIGNATORY_NAME,
  MAX_SIGNATORY_ROLE,
  MAX_SIGNATURE_BYTES,
  SIGNATURE_DATA_URL_PATTERN,
  SHARE_TOKEN_PATTERN,
  buildSignatureStamp,
  isValidDocumentIdentifier,
  stampSignature,
} from '@/lib/partnerships/signing';
import { notificationsService } from '@/services/notifications.service';
import { buildPartnershipSignedEmail } from '@/lib/email/rillcod-transactional-email';
import { brandContact } from '@/config/brand';

export const dynamic = 'force-dynamic';

/** Columns every public read of a document needs. */
const DOC_COLS =
  'id, reference, document_kind, status, document_html, school_id, signed_at, signed_by_name, signed_by_role, share_token, access_code';

/**
 * Find a document from what the URL carried.
 *
 * Two ways in, and both are secrets: the share token from the link we sent, or
 * the six digits printed on the page. Never the reference — it is sequential and
 * printed on every document, so accepting it would let one proposal unlock all
 * the others.
 */
async function resolveDocument(db: ReturnType<typeof createAdminClient>, value: string) {
  const column = SHARE_TOKEN_PATTERN.test(value) ? 'share_token' : 'access_code';
  const { data } = await db
    .from('partnership_agreements')
    .select(DOC_COLS)
    .eq(column, value)
    .maybeSingle();
  return data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const value = String(token || '').trim();
  // A malformed token is indistinguishable from a wrong one, on purpose: this
  // endpoint never confirms that a document exists to somebody without the link.
  if (!isValidDocumentIdentifier(value)) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const db = createAdminClient();
  const doc = await resolveDocument(db, value);

  if (!doc) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const { data: school } = await db
    .from('schools')
    .select('id, name, city, state')
    .eq('id', doc.school_id)
    .maybeSingle();

  // Normalize image URLs and asset paths on stored HTML to guarantee images load
  // across custom domains, local testing, and staging containers without CORS or encoding issues.
  let cleanHtml = String(doc.document_html || '');
  cleanHtml = cleanHtml.replace(/src=["'](?:https?:\/\/[^"']*\/)?(images\/[^"']+)["']/gi, (match, path) => {
    try {
      const decoded = decodeURIComponent(path);
      const encoded = decoded.split('/').map((s) => encodeURIComponent(s)).join('/');
      return `src="/${encoded}"`;
    } catch {
      return match;
    }
  });

  return NextResponse.json({
    id: doc.id,
    reference: doc.reference,
    kind: doc.document_kind,
    status: doc.status,
    html: cleanHtml,
    signedAt: doc.signed_at,
    signedByName: doc.signed_by_name,
    signedByRole: doc.signed_by_role,
    /*
      The six digits, shown back to whoever already got in.

      This is a credential, so handing it out would normally be the wrong move.
      It is safe here precisely because of what it took to reach this line: the
      caller presented a valid share token or a valid access code for *this*
      document, so they already hold one of the two secrets. Echoing the code is
      not a disclosure, it is a reminder — and it is what lets a school that
      still has the link, but has mislaid the printed sheet, find the code to
      type at /p next time.
    */
    accessCode: doc.access_code ?? null,
    school: school || null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const value = String(token || '').trim();
  if (!isValidDocumentIdentifier(value)) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  // Signing writes to the database from an unauthenticated request. The token
  // makes guessing impractical; this stops one leaked link being hammered.
  const ip = await getClientIp(req as any);
  try {
    await checkCustomRateLimit({ key: `partnership-sign:${ip}`, max: 10, window: 3600 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a moment and try again.' },
        { status: 429 },
      );
    }
    throw err;
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const signatoryName = String(body.signatory_name || '').trim().slice(0, MAX_SIGNATORY_NAME);
  const signatoryRole = String(body.signatory_role || 'Proprietor / Principal').trim().slice(0, MAX_SIGNATORY_ROLE);
  const signatureDataUrl = String(body.signature_data_url || '').trim();

  if (!signatoryName) {
    return NextResponse.json({ error: 'Signatory name is required to sign.' }, { status: 400 });
  }
  if (signatureDataUrl) {
    if (signatureDataUrl.length > MAX_SIGNATURE_BYTES) {
      return NextResponse.json({ error: 'That signature image is too large.' }, { status: 413 });
    }
    if (!SIGNATURE_DATA_URL_PATTERN.test(signatureDataUrl)) {
      return NextResponse.json({ error: 'That signature is not a valid image.' }, { status: 400 });
    }
  }

  // Same rule as the read: a token or an access code, never a reference. This is
  // the path that signs, so it is the one that matters most — a reference is
  // sequential and printed, and signing an agreement in a school's name should
  // take more than counting.
  const db = createAdminClient();
  const doc = await resolveDocument(db, value);

  if (!doc) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  if (doc.status === 'signed') {
    return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 });
  }
  if (doc.status === 'void' || doc.status === 'declined') {
    return NextResponse.json(
      { error: `Cannot sign document with status ${doc.status}.` },
      { status: 409 },
    );
  }

  const signedAt = new Date().toISOString();

  // Stamp the signature into the document, in place of the anchor the templates
  // leave for it. Everything interpolated is escaped: an unauthenticated caller
  // must not be able to rewrite the visible content of a signed contract.
  let updatedHtml = doc.document_html || '';
  if (signatureDataUrl && updatedHtml) {
    const stamp = buildSignatureStamp({ signatoryName, signatoryRole, signatureDataUrl, signedAt });

    // Both templates leave the anchor. This used to replace the literal "Official
    // stamp", which only the MoU contains — so signing a proposal set the status
    // to signed and put nothing on the page.
    const stamped = stampSignature(updatedHtml, stamp);
    if (stamped === null) {
      return NextResponse.json(
        { error: 'This document cannot be counter-signed online. Please contact us to sign it.' },
        { status: 409 },
      );
    }
    updatedHtml = stamped;
  }

  const { error: updateError } = await db
    .from('partnership_agreements')
    .update({
      status: 'signed',
      signed_at: signedAt,
      signed_by_name: signatoryName,
      signed_by_role: signatoryRole,
      signature_ip: ip,
      document_html: updatedHtml,
    })
    .eq('id', doc.id)
    // Only from an unsigned state. Two taps on a slow phone would otherwise both
    // pass the check above and the second would overwrite the first signature.
    .not('status', 'in', '("signed","void","declined")');

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // A school that signs is a school we work with. 'approved' is what
  // `schools_status_check` permits — 'active' is not a value the column accepts,
  // and this update discarded its own error, so it silently did nothing.
  if (doc.school_id) {
    const { error: promoteError } = await db
      .from('schools')
      .update({ status: 'approved' })
      .eq('id', doc.school_id)
      .eq('status', 'pending');
    if (promoteError) {
      // The signature is recorded and that is what matters; the school's status
      // is a follow-up an admin can fix. Say so rather than failing the signing.
      console.warn('[partnerships] could not approve school after signing:', promoteError.message);
    }
  }

  /**
   * Both parties get their copy, without anyone asking for it.
   *
   * Signing used to end in silence: the school tapped Sign and heard nothing,
   * and nobody here was told either. A signature with no receipt is one somebody
   * can reasonably doubt happened. Two messages go out with the same reference,
   * the same names and the same link — one to the school, one to us.
   *
   * Awaited, not fired and forgotten. The mail path reads request-scoped state,
   * and work that outlives the response loses that scope — which shows up as a
   * confirmation that silently never sends. Two messages cost a moment; a
   * signature nobody can prove costs more.
   *
   * The whole block cannot fail the signing: the agreement is executed the moment
   * the row is updated, and a mail provider having a bad minute must not turn
   * that into an error on the school's phone.
   */
  await (async () => {
    try {
      const { data: school } = await db
        .from('schools')
        .select('name, email')
        .eq('id', doc.school_id)
        .maybeSingle();

      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || brandContact.siteUrl).replace(/\/$/, '');
      const signedAtLabel = new Date(signedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const common = {
        schoolName: String(school?.name || 'the school'),
        reference: String(doc.reference),
        signatoryName,
        signatoryRole,
        signedAtLabel,
        shareUrl: `${appUrl}/p/${value}`,
      };

      const recipients: { to: string; audience: 'school' | 'internal' }[] = [
        ...(school?.email ? [{ to: String(school.email), audience: 'school' as const }] : []),
        { to: brandContact.email, audience: 'internal' as const },
      ];

      for (const r of recipients) {
        await notificationsService.sendEmail('system', {
          to: r.to,
          subject:
            r.audience === 'school'
              ? `Signed — Memorandum of Understanding (${doc.reference})`
              : `${common.schoolName} signed ${doc.reference}`,
          html: buildPartnershipSignedEmail({ ...common, audience: r.audience }),
          templateKey: 'partnership_signed',
          referenceId: String(doc.reference),
        });
      }
    } catch (mailError) {
      console.warn('[partnerships] signed but could not send confirmations:', mailError);
    }
  })();

  return NextResponse.json({
    success: true,
    message: `${doc.reference} successfully signed by ${signatoryName}.`,
    reference: doc.reference,
    signedAt,
    signatoryName,
  });
}
