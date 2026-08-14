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
  buildSignatureStamp,
  isValidShareToken,
  stampSignature,
} from '@/lib/partnerships/signing';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const value = String(token || '').trim();
  // A malformed token is indistinguishable from a wrong one, on purpose: this
  // endpoint never confirms that a document exists to somebody without the link.
  if (!isValidShareToken(value)) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const db = createAdminClient();
  const { data: doc, error } = await db
    .from('partnership_agreements')
    // No terms_snapshot: it is the commercial record, the page never shows it,
    // and the rendered document already says everything the reader should see.
    .select('id, reference, document_kind, status, document_html, school_id, signed_at, signed_by_name, signed_by_role')
    .eq('share_token', value)
    .maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const { data: school } = await db
    .from('schools')
    .select('id, name, city, state')
    .eq('id', doc.school_id)
    .maybeSingle();

  return NextResponse.json({
    id: doc.id,
    reference: doc.reference,
    kind: doc.document_kind,
    status: doc.status,
    html: doc.document_html,
    signedAt: doc.signed_at,
    signedByName: doc.signed_by_name,
    signedByRole: doc.signed_by_role,
    school: school || null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const value = String(token || '').trim();
  if (!isValidShareToken(value)) {
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

  const db = createAdminClient();
  const { data: doc, error } = await db
    .from('partnership_agreements')
    .select('id, reference, status, document_kind, document_html, school_id')
    .eq('share_token', value)
    .maybeSingle();

  if (error || !doc) {
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

  return NextResponse.json({
    success: true,
    message: `${doc.reference} successfully signed by ${signatoryName}.`,
    reference: doc.reference,
    signedAt,
    signatoryName,
  });
}
