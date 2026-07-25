import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  const admin = createAdminClient();
  const upper = code.toUpperCase();
  const cardSelect = '*, portal_users!identity_cards_holder_id_fkey(id, full_name, email, school_id, school_name, section_class), schools(name)';
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

  // Card verify only confirms the physical ID. Grades live on /result-check and must
  // pass the parent/staff gate — never attach report payloads here.
  return NextResponse.json({
    valid: result === 'ok',
    result,
    card: {
      id: card.id,
      card_number: card.card_number,
      holder_type: card.holder_type,
      // NOTE: the holder's UUID is intentionally NOT returned — for legacy cards the raw
      // UUID doubles as a result-access credential, so it must not be broadcast publicly.
      status: card.status,
      issued_at: card.issued_at,
      expires_at: card.expires_at,
      holder_name: card.portal_users?.full_name ?? null,
      school_name: card.portal_users?.school_name ?? card.schools?.name ?? null,
      grade: card.portal_users?.grade ?? null,
      section_class: card.portal_users?.section_class ?? null,
    },
    // Kept for older clients; always empty so this endpoint cannot bypass result gates.
    reports: [],
  });
}
