import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool, getStaffContext } from '@/lib/cards/rbac';

async function generateUniqueCode(db: ReturnType<typeof createAdminClient>, column: 'card_number' | 'verification_code', prefix: string) {
  for (let i = 0; i < 8; i++) {
    const code = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data } = await (db as any).from('identity_cards').select('id').eq(column, code).maybeSingle();
    if (!data?.id) return code;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
}

// POST /api/cards/[id]/reissue — replace a lost/damaged card in one step:
// revokes the old card (history preserved) and issues a new one with fresh codes.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body?.reason || 'reissued').slice(0, 200);

  const db = createAdminClient();
  const { data: card, error: cardErr } = await (db as any)
    .from('identity_cards')
    .select('*')
    .eq('id', id)
    .single();
  if (cardErr || !card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  // Parent cards store school_id=null — resolve scope from the holder like the status route does.
  let effectiveSchoolId = card.school_id;
  if (!effectiveSchoolId && card.holder_type === 'parent') {
    const { data: holder } = await (db as any).from('portal_users').select('school_id').eq('id', card.holder_id).maybeSingle();
    effectiveSchoolId = holder?.school_id ?? null;
  }
  if (!canAccessSchool(ctx, effectiveSchoolId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (card.holder_type === 'teacher' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Teacher cards can only be reissued by admin' }, { status: 403 });
  }
  if (card.status === 'revoked') {
    return NextResponse.json({ error: 'Card is already revoked — issue a new card instead' }, { status: 409 });
  }

  const now = new Date().toISOString();

  // 1. Revoke the old card (keeps full history + old codes stop verifying)
  const { error: revokeErr } = await (db as any)
    .from('identity_cards')
    .update({ status: 'revoked', revoked_at: now, revoked_reason: reason, updated_by: ctx.id, updated_at: now })
    .eq('id', id);
  if (revokeErr) return NextResponse.json({ error: revokeErr.message }, { status: 500 });

  // 2. Issue the replacement with fresh codes
  const card_number = await generateUniqueCode(db, 'card_number', 'CARD');
  const verification_code = await generateUniqueCode(db, 'verification_code', 'RC');

  const { data: newCard, error: issueErr } = await (db as any)
    .from('identity_cards')
    .insert({
      holder_type: card.holder_type,
      holder_id: card.holder_id,
      school_id: card.school_id,
      class_id: card.class_id,
      card_number,
      verification_code,
      template_type: card.template_type,
      status: 'active',
      issued_at: now,
      expires_at: card.expires_at && new Date(card.expires_at).getTime() > Date.now() ? card.expires_at : null,
      created_by: ctx.id,
      updated_by: ctx.id,
      metadata: { ...(card.metadata ?? {}), reissued_from: card.id },
    })
    .select('*')
    .single();
  if (issueErr) return NextResponse.json({ error: issueErr.message }, { status: 500 });

  await (db as any).from('card_audit_logs').insert([
    {
      card_id: card.id,
      actor_id: ctx.id,
      school_id: card.school_id,
      action: 'status:revoked',
      entity: 'identity_card',
      details: { reason, replaced_by: newCard.id },
    },
    {
      card_id: newCard.id,
      actor_id: ctx.id,
      school_id: card.school_id,
      action: 'reissue',
      entity: 'identity_card',
      details: { previous_card: card.id, reason },
    },
  ]);

  return NextResponse.json({ data: newCard, revoked_card_id: card.id }, { status: 201 });
}
