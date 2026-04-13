import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool, getStaffContext } from '@/lib/cards/rbac';

export async function POST(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const verification_code = String(body?.verification_code || '').trim();
  if (!verification_code) return NextResponse.json({ error: 'verification_code is required' }, { status: 400 });

  const db = createAdminClient();
  const { data: card, error } = await (db as any)
    .from('identity_cards')
    .select('*')
    .eq('verification_code', verification_code)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!card) {
    return NextResponse.json({ valid: false, result: 'invalid' }, { status: 404 });
  }
  if (!canAccessSchool(ctx, card.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = Date.now();
  const expiresAt = card.expires_at ? new Date(card.expires_at).getTime() : null;
  const result =
    card.status === 'revoked'
      ? 'revoked'
      : expiresAt && expiresAt < now
        ? 'expired'
        : card.status === 'expired'
          ? 'expired'
          : 'ok';

  await (db as any).from('card_scan_logs').insert({
    card_id: card.id,
    scanned_by: ctx.id,
    school_id: card.school_id,
    source: 'web',
    scan_result: result,
    metadata: { role: ctx.role },
  });

  await (db as any).from('card_audit_logs').insert({
    card_id: card.id,
    actor_id: ctx.id,
    school_id: card.school_id,
    action: 'verify',
    entity: 'identity_card',
    details: { result },
  });

  return NextResponse.json({ valid: result === 'ok', result, card });
}

