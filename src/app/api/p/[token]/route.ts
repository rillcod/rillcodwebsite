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
  isAffirmedAuthorised,
  isValidShareToken,
  publicReadAccess,
  publicSignRefusal,
  stampSignature,
} from '@/lib/partnerships/signing';
import { isQuoteExpired } from '@/lib/partnerships/issue-document';
import { notificationsService } from '@/services/notifications.service';
import { buildPartnershipSignedEmail } from '@/lib/email/rillcod-transactional-email';
import { brandContact } from '@/config/brand';

export const dynamic = 'force-dynamic';

/** Columns every public read of a document needs. */
const DOC_COLS =
  'id, reference, document_kind, status, document_html, school_id, signed_at, signed_by_name, signed_by_role, share_token, access_code, valid_until, open_count, first_opened_at';

/**
 * Find a document from what the URL carried.
 *
 * Two ways in, and both are secrets: the share token from the link we sent, or
 * the six digits printed on the page. Never the reference — it is sequential and
 * printed on every document, so accepting it would let one proposal unlock all
 * the others.
 */
async function resolveDocument(db: ReturnType<typeof createAdminClient>, value: string) {
  // Share token only. Six-digit codes go through /api/p/lookup, which is
  // rate-limited. Accepting them here made that limit ornamental: a million
  // codes against this GET, with no cap, is how the printed code unlocked
  // every school's fees.
  const { data } = await db
    .from('partnership_agreements')
    .select(DOC_COLS)
    .eq('share_token', value)
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
  if (!isValidShareToken(value)) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const db = createAdminClient();
  const doc = await resolveDocument(db, value);

  if (!doc) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  /*
    A withdrawn document stops being readable, not just stops being signable.

    Signing already refused `void` and `declined`, but reading did not — so
    voiding a proposal issued in error withdrew nothing: the school could still
    open the link and read fees we had retracted, and would have no way to know
    they were no longer on offer. 410 rather than 404 because the document did
    exist and the reader is not wrong to have the link; the page says so and
    points them at us.

    Drafts 404 rather than 410: they have not left the building, and confirming
    they exist would tell a guessed token holder that a quote is sitting there.
  */
  const access = publicReadAccess(doc.status);
  if (access === 'not_found') {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }
  if (access === 'withdrawn') {
    return NextResponse.json(
      {
        error:
          'This document has been withdrawn and is no longer current. Please contact us for an up-to-date copy.',
        withdrawn: true,
      },
      { status: 410 },
    );
  }

  /*
    Record that the recipient opened it.

    A proposal sent and never opened needs a different follow-up from one opened
    four times and still unsigned, and there was no way to tell those apart —
    the most useful signal in the whole pipeline, and nobody was writing it down.

    Deliberately fire-and-forget, and deliberately swallowed. A read receipt is
    bookkeeping; if it fails, the school still gets to read their proposal. The
    same reasoning keeps these columns out of the signed-document freeze: a
    signed contract can still be opened, and counting that does not amend it.
  */
  void db
    .from('partnership_agreements')
    .update({
      open_count: (Number(doc.open_count) || 0) + 1,
      first_opened_at: doc.first_opened_at ?? new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
    })
    .eq('id', doc.id)
    .then(undefined, () => {});

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
    validUntil: doc.valid_until ?? null,
    expired: isQuoteExpired(doc.valid_until),
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
  if (!isAffirmedAuthorised(body.authorised ?? body.authorized)) {
    return NextResponse.json(
      { error: 'Confirm you are authorised to bind the school before signing.' },
      { status: 400 },
    );
  }
  if (!signatureDataUrl) {
    return NextResponse.json({ error: 'A signature image is required to sign.' }, { status: 400 });
  }
  if (signatureDataUrl.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: 'That signature image is too large.' }, { status: 413 });
  }
  if (!SIGNATURE_DATA_URL_PATTERN.test(signatureDataUrl)) {
    return NextResponse.json({ error: 'That signature is not a valid image.' }, { status: 400 });
  }

  // Share token only. A six-digit code is for lookup, not for an unauthenticated
  // write that executes a contract.
  const db = createAdminClient();
  const doc = await resolveDocument(db, value);

  if (!doc) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const refusal = publicSignRefusal({
    document_kind: doc.document_kind,
    status: doc.status,
    expired: isQuoteExpired(doc.valid_until),
  });
  if (refusal) {
    return NextResponse.json(
      { error: refusal.error, ...(refusal.expired ? { expired: true } : {}) },
      { status: refusal.status },
    );
  }

  const signedAt = new Date().toISOString();

  // Stamp the signature into the document, in place of the anchor the templates
  // leave for it. Everything interpolated is escaped: an unauthenticated caller
  // must not be able to rewrite the visible content of a signed contract.
  /*
    Who the signatory said they could bind.

    Read from the school record rather than taken from the request: the party
    being bound is not something the person signing gets to type. Printed only
    because they affirmed authority on this request — the checkbox used to live
    only in the browser, and the stamp then claimed a declaration nobody made.
  */
  let boundParty: string | null = null;
  if (doc.school_id) {
    const { data: signingSchool } = await db
      .from('schools')
      .select('name')
      .eq('id', doc.school_id)
      .maybeSingle();
    boundParty = signingSchool?.name ? String(signingSchool.name) : null;
  }

  let updatedHtml = doc.document_html || '';
  const stamp = buildSignatureStamp({
    signatoryName,
    signatoryRole,
    signatureDataUrl,
    signedAt,
    boundParty,
  });

  const stamped = stampSignature(updatedHtml, stamp);
  if (stamped === null) {
    return NextResponse.json(
      { error: 'This document cannot be counter-signed online. Please contact us to sign it.' },
      { status: 409 },
    );
  }
  updatedHtml = stamped;

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
    .not('status', 'in', '("signed","void","declined","draft")');

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
