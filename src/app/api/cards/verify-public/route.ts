import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { resolveStaffResultBypass } from '@/lib/parent-claim/staff-bypass';

/**
 * Public ID-card verification.
 * Anonymous callers get validity + non-identifying card metadata only.
 * Logged-in staff in-scope get holder identity (and holder_id for attendance scanners).
 */
export async function GET(request: Request) {
  try {
    await checkCustomRateLimit({ key: `public-card-verify:${getClientIp(request as any)}`, max: 20, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait before trying again.', retryAfter: (err as any).retryAfter ?? 60 },
        { status: 429 },
      );
    }
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  const admin = createAdminClient();
  const upper = code.toUpperCase();
  const cardSelect = '*, portal_users!identity_cards_holder_id_fkey(id, full_name, school_id, school_name, section_class), schools(name)';
  let { data: card, error } = await (admin as any)
    .from('identity_cards')
    .select(cardSelect)
    .eq('verification_code', upper)
    .maybeSingle();

  // Backward-compat: OLDER cards encoded the card_number (CARD-…) rather than the
  // verification_code. Fall back to matching that so legacy cards still verify.
  if (!error && !card) {
    ({ data: card, error } = await (admin as any)
      .from('identity_cards')
      .select(cardSelect)
      .eq('card_number', upper)
      .maybeSingle());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ valid: false, result: 'invalid' }, { status: 404 });

  const now = Date.now();
  const expiresAt = card.expires_at ? new Date(card.expires_at).getTime() : null;
  const result =
    card.status === 'revoked' ? 'revoked'
    : expiresAt && expiresAt < now ? 'expired'
    : card.status === 'expired' ? 'expired'
    : 'ok';

  // Lazy auto-expire: flip a stale 'active' card to 'expired' so lists stay accurate.
  if (result === 'expired' && card.status === 'active') {
    (admin as any).from('identity_cards')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', card.id)
      .then(() => {}).catch(() => {});
  }

  // Fire-and-forget scan log ('qr' is the only public-scan source the CHECK constraint allows)
  (admin as any).from('card_scan_logs').insert({
    card_id: card.id,
    scanned_by: null,
    school_id: card.school_id,
    source: 'qr',
    scan_result: result,
    metadata: { via: 'public_qr' },
  }).then(() => {}).catch(() => {});

  const holderSchoolId = card.portal_users?.school_id ?? card.school_id ?? null;
  const staffBypass = await resolveStaffResultBypass(admin as any, holderSchoolId);
  const revealIdentity = staffBypass.bypass;

  return NextResponse.json({
    valid: result === 'ok',
    result,
    staffBypass: staffBypass.bypass,
    card: {
      id: card.id,
      card_number: card.card_number,
      holder_type: card.holder_type,
      // holder_id only for in-scope staff (attendance / QR scanners). Never for anonymous —
      // legacy UUID cards treat the raw UUID as a result-access credential.
      holder_id: revealIdentity ? (card.portal_users?.id ?? card.holder_id ?? null) : null,
      status: card.status,
      issued_at: card.issued_at,
      expires_at: card.expires_at,
      holder_name: revealIdentity ? (card.portal_users?.full_name ?? null) : null,
      school_name: revealIdentity
        ? (card.portal_users?.school_name ?? card.schools?.name ?? null)
        : null,
      grade: null,
      section_class: revealIdentity ? (card.portal_users?.section_class ?? null) : null,
    },
    // Grades live on /result-check behind the parent/staff gate.
    reports: [],
  });
}
