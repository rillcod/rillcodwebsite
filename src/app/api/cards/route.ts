import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool, getStaffContext } from '@/lib/cards/rbac';

function generateCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function GET(request: Request) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const holderType = searchParams.get('holder_type');
  const status = searchParams.get('status');
  const schoolId = searchParams.get('school_id');

  const db = createAdminClient();
  let q = (db as any)
    .from('identity_cards')
    .select('*, portal_users!identity_cards_holder_id_fkey(id, full_name, email, school_id, school_name, section_class)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(200);

  if (holderType) q = q.eq('holder_type', holderType);
  if (status) q = q.eq('status', status);
  if (schoolId) q = q.eq('school_id', schoolId);

  if (ctx.role !== 'admin') {
    if (ctx.school_ids.length === 0) return NextResponse.json({ data: [], total: 0 });
    q = q.in('school_id', ctx.school_ids);
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
    school_id,
    class_id = null,
    template_type = holder_type,
    expires_at = null,
    metadata = {},
  } = body || {};

  if (!holder_type || !holder_id || !school_id) {
    return NextResponse.json({ error: 'holder_type, holder_id, and school_id are required' }, { status: 400 });
  }
  if (!['student', 'parent', 'teacher'].includes(holder_type)) {
    return NextResponse.json({ error: 'Invalid holder_type' }, { status: 400 });
  }
  if (!canAccessSchool(ctx, school_id)) {
    return NextResponse.json({ error: 'Forbidden for this school scope' }, { status: 403 });
  }

  const db = createAdminClient();
  const card_number = generateCode('CARD');
  const verification_code = generateCode('RC');
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
      status: 'issued',
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

