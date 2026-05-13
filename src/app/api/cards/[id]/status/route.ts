import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool, getStaffContext } from '@/lib/cards/rbac';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const { status, reason } = body || {};
  if (!['active', 'revoked', 'expired'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: card, error: cardErr } = await (db as any)
    .from('identity_cards')
    .select('*')
    .eq('id', id)
    .single();
  if (cardErr || !card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  // Parent cards have school_id=null on the card row — resolve the parent's school from portal_users
  let effectiveSchoolId = card.school_id;
  if (!effectiveSchoolId && card.holder_type === 'parent') {
    const { data: holder } = await (db as any).from('portal_users').select('school_id').eq('id', card.holder_id).maybeSingle();
    effectiveSchoolId = holder?.school_id ?? null;
  }
  if (!canAccessSchool(ctx, effectiveSchoolId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const patch: Record<string, unknown> = { status, updated_by: ctx.id, updated_at: new Date().toISOString() };
  if (status === 'active') patch.activated_at = new Date().toISOString();
  if (status === 'revoked') {
    patch.revoked_at = new Date().toISOString();
    patch.revoked_reason = reason || null;
  }
  if (status === 'expired') patch.expires_at = new Date().toISOString();

  const { data, error } = await (db as any).from('identity_cards').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (db as any).from('card_audit_logs').insert({
    card_id: id,
    actor_id: ctx.id,
    school_id: card.school_id,
    action: `status:${status}`,
    entity: 'identity_card',
    details: { reason: reason || null },
  });

  return NextResponse.json({ data });
}

