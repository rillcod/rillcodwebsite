import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = String(searchParams.get('code') || '').trim();

  if (!code) {
    return NextResponse.json({ error: 'Please enter an access code or reference.' }, { status: 400 });
  }

  // Rate limiting to prevent brute-forcing
  const ip = await getClientIp(req as any);
  try {
    await checkCustomRateLimit({ key: `p-lookup:${ip}`, max: 30, window: 600 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a moment and try again.' },
        { status: 429 },
      );
    }
    throw err;
  }

  const cleanCode = code.replace(/[\s-]/g, '').toUpperCase();
  const db = createAdminClient();

  // 1. Try matching by reference (e.g. RC-MOU-2026-00001 or RC-PROP-2026-00001)
  let query = db
    .from('partnership_agreements')
    .select('id, reference, share_token, document_kind, status, school_id')
    .or(`reference.ilike.%${cleanCode}%,share_token.ilike.${cleanCode}%`)
    .limit(1);

  const { data: matches, error } = await query;

  let doc = matches && matches.length > 0 ? matches[0] : null;

  // 2. If not matched, try matching the trailing digits of the reference (e.g. 00001 or 849201)
  if (!doc) {
    const { data: byRef } = await db
      .from('partnership_agreements')
      .select('id, reference, share_token, document_kind, status, school_id')
      .ilike('reference', `%${cleanCode}%`)
      .limit(1);
    if (byRef && byRef.length > 0) doc = byRef[0];
  }

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found. Please check your code or reference.' }, { status: 404 });
  }

  const { data: school } = await db
    .from('schools')
    .select('id, name, city, state')
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
