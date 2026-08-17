/**
 * Exchange a six-digit access code for the share token.
 *
 * A school that has lost the link needs a way back in, and this is it. What it
 * must never accept is the reference: RC-PROP-2026-00042 is sequential and
 * printed on the face of the document, so accepting it here handed anyone who
 * could count from 00001 the key to every school's agreement — the exact hole
 * `share_token` exists to close, reopened through a second door.
 *
 * So: exact match on a secret, never a pattern match on a public identifier.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { ACCESS_CODE_PATTERN, isValidShareToken, publicReadAccess } from '@/lib/partnerships/signing';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = String(searchParams.get('code') || '').trim();

  if (!raw) {
    return NextResponse.json({ error: 'Please enter your access code.' }, { status: 400 });
  }

  // Tighter than the signing limit: this is the endpoint somebody would point a
  // script at, and six digits is a small enough space to deserve it.
  const ip = await getClientIp(req as any);
  try {
    await checkCustomRateLimit({ key: `p-lookup:${ip}`, max: 10, window: 900 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes and try again.' },
        { status: 429 },
      );
    }
    throw err;
  }

  const db = createAdminClient();

  /**
   * Two ways in, both secrets.
   *
   * Spaces come out because people type "782 587"; hyphens come out of the code
   * only, because a share token *is* hyphens — stripping them first meant the
   * token branch tested a 32-character string against a pattern that requires
   * the dashed form, so it could never match and pasting a link never worked.
   *
   * The reference is not accepted. It is sequential and printed on every
   * document, so trading one for a token would hand anybody holding a single
   * proposal the key to all the others.
   */
  const typed = raw.replace(/\s+/g, '');
  const asCode = typed.replace(/-/g, '');

  const COLS = 'reference, share_token, document_kind, status, school_id';
  let query;
  if (ACCESS_CODE_PATTERN.test(asCode)) {
    query = db.from('partnership_agreements').select(COLS).eq('access_code', asCode);
  } else if (isValidShareToken(typed)) {
    query = db.from('partnership_agreements').select(COLS).eq('share_token', typed.toLowerCase());
  } else {
    // Deliberately the same message a wrong code gets: this endpoint never
    // explains what a valid code looks like to somebody probing it.
    return NextResponse.json({ error: 'That code was not recognised.' }, { status: 404 });
  }

  const { data: doc, error } = await query.maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ error: 'That code was not recognised.' }, { status: 404 });
  }

  const access = publicReadAccess(doc.status);
  if (access !== 'ok') {
    // Drafts look like a miss. Withdrawn documents say so, so a school that
    // still has the printed sheet is not told the code is wrong.
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
    return NextResponse.json({ error: 'That code was not recognised.' }, { status: 404 });
  }

  const { data: school } = await db
    .from('schools')
    .select('name')
    .eq('id', doc.school_id)
    .maybeSingle();

  return NextResponse.json({
    found: true,
    token: doc.share_token,
    reference: doc.reference,
    kind: doc.document_kind,
    status: doc.status,
    schoolName: school?.name || null,
  });
}
