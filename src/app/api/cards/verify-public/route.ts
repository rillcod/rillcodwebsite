import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: card, error } = await (admin as any)
    .from('identity_cards')
    .select('*, portal_users!identity_cards_holder_id_fkey(id, full_name, email, school_id, school_name, section_class), schools(name)')
    .eq('verification_code', code.toUpperCase())
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ valid: false, result: 'invalid' }, { status: 404 });

  const now = Date.now();
  const expiresAt = card.expires_at ? new Date(card.expires_at).getTime() : null;
  const result =
    card.status === 'revoked' ? 'revoked'
    : expiresAt && expiresAt < now ? 'expired'
    : card.status === 'expired' ? 'expired'
    : 'ok';

  // Fire-and-forget scan log
  (admin as any).from('card_scan_logs').insert({
    card_id: card.id,
    scanned_by: null,
    school_id: card.school_id,
    source: 'public_verify',
    scan_result: result,
    metadata: { via: 'public_qr' },
  }).then(() => {}).catch(() => {});

  return NextResponse.json({
    valid: result === 'ok',
    result,
    card: {
      id: card.id,
      card_number: card.card_number,
      holder_type: card.holder_type,
      holder_id: card.portal_users?.id ?? null,
      status: card.status,
      issued_at: card.issued_at,
      expires_at: card.expires_at,
      holder_name: card.portal_users?.full_name ?? null,
      school_name: card.portal_users?.school_name ?? card.schools?.name ?? null,
      section_class: card.portal_users?.section_class ?? null,
    },
  });
}
