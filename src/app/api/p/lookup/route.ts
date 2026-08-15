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
import { isValidShareToken } from '@/lib/partnerships/signing';

export const dynamic = 'force-dynamic';

/** Exactly six digits. Nothing else reaches the database. */
const ACCESS_CODE = /^[0-9]{6}$/;

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

  const cleaned = raw.replace(/[\s-]/g, '');
  const db = createAdminClient();

  // Two ways in, both secrets: the six digits printed on the document, or the
  // token itself if somebody pasted the whole link.
  let query;
  if (ACCESS_CODE.test(cleaned)) {
    query = db.from('partnership_agreements').select('reference, share_token, document_kind, status, school_id').eq('access_code', cleaned);
  } else if (isValidShareToken(cleaned)) {
    query = db.from('partnership_agreements').select('reference, share_token, document_kind, status, school_id').eq('share_token', cleaned.toLowerCase());
  } else {
    // Deliberately the same message a wrong code gets: this endpoint never
    // explains what a valid code looks like to somebody probing it.
    return NextResponse.json({ error: 'That code was not recognised.' }, { status: 404 });
  }

  const { data: doc, error } = await query.maybeSingle();

  if (error || !doc) {
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
