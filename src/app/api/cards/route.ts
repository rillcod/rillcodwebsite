import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool, getStaffContext } from '@/lib/cards/rbac';

async function generateUniqueCode(db: ReturnType<typeof createAdminClient>, column: 'card_number' | 'verification_code', prefix: string) {
  for (let i = 0; i < 8; i++) {
    const code = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data } = await (db as any).from('identity_cards').select('id').eq(column, code).maybeSingle();
    if (!data?.id) return code;
  }
  // Final fallback with extra entropy — collision probability vanishingly small
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
}

export async function GET(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const holderType = searchParams.get('holder_type');
  const status = searchParams.get('status');
  const schoolId = searchParams.get('school_id');
  const holderId = searchParams.get('holder_id');

  const db = createAdminClient();
  let q = (db as any)
    .from('identity_cards')
    .select('*, portal_users!identity_cards_holder_id_fkey(id, full_name, email, school_id, school_name, section_class)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(500);

  if (holderType) q = q.eq('holder_type', holderType);
  if (holderType === 'teacher' && ctx.role !== 'admin') {
    return NextResponse.json({ data: [], total: 0 });
  }
  if (status) q = q.eq('status', status);
  if (schoolId) q = q.eq('school_id', schoolId);
  if (holderId) q = q.eq('holder_id', holderId);

  if (ctx.role !== 'admin') {
    if (ctx.school_ids.length === 0) return NextResponse.json({ data: [], total: 0 });

    if (holderType === 'parent') {
      // Parent cards have school_id=null on the card itself — filter by the holder's school instead
      const { data: parents } = await (db as any)
        .from('portal_users')
        .select('id')
        .eq('role', 'parent')
        .in('school_id', ctx.school_ids);
      const parentIds = (parents ?? []).map((p: any) => p.id);
      if (parentIds.length === 0) return NextResponse.json({ data: [], total: 0 });
      q = q.in('holder_id', parentIds);
    } else {
      q = q.in('school_id', ctx.school_ids);
    }
  }

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}

export async function POST(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    holder_type,
    holder_id,
    class_id = null,
    template_type = holder_type,
    expires_at = null,
    metadata = {},
  } = body || {};

  // Resolve school_id: use body value, or fall back to staff's own school for parent cards
  const school_id: string | null = body.school_id || (holder_type === 'parent' ? (ctx.school_ids[0] ?? null) : null);

  if (!holder_type || !holder_id) {
    return NextResponse.json({ error: 'holder_type and holder_id are required' }, { status: 400 });
  }
  if (!['student', 'parent', 'teacher'].includes(holder_type)) {
    return NextResponse.json({ error: 'Invalid holder_type' }, { status: 400 });
  }
  if (holder_type !== 'parent' && !school_id) {
    return NextResponse.json({ error: 'school_id is required for student and teacher cards' }, { status: 400 });
  }
  if (holder_type === 'teacher' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Teacher cards can only be issued by admin' }, { status: 403 });
  }
  if (school_id && !canAccessSchool(ctx, school_id)) {
    return NextResponse.json({ error: 'Forbidden for this school scope' }, { status: 403 });
  }

  // Check for existing active/expired card — prevent duplicates (revoked cards allow re-issue)
  const db = createAdminClient();
  const { data: existing } = await (db as any)
    .from('identity_cards')
    .select('id, status')
    .eq('holder_type', holder_type)
    .eq('holder_id', holder_id)
    .not('status', 'eq', 'revoked')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A card has already been issued for this holder', existing_id: existing.id }, { status: 409 });
  }

  const card_number = await generateUniqueCode(db, 'card_number', 'CARD');
  const verification_code = await generateUniqueCode(db, 'verification_code', 'RC');
  const now = new Date().toISOString();

  const { data, error } = await (db as any)
    .from('identity_cards')
    .insert({
      holder_type,
      holder_id,
      school_id,
      class_id,
      card_number,
      verification_code,
      template_type,
      status: 'active',
      issued_at: now,
      expires_at,
      created_by: ctx.id,
      updated_by: ctx.id,
      metadata,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (db as any).from('card_audit_logs').insert({
    card_id: data.id,
    actor_id: ctx.id,
    school_id,
    action: 'issue',
    entity: 'identity_card',
    details: { holder_type, holder_id },
  });

  return NextResponse.json({ data }, { status: 201 });
}
