import { NextRequest, NextResponse } from 'next/server';
import { requireCrmStaffOrNull } from '@/lib/crm/auth';
import { assertCrmContactAccess, requireContactIdForNonAdmin } from '@/lib/crm/scope';

export async function GET(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;

  const url = new URL(req.url);
  const contact_id = url.searchParams.get('contact_id');
  const stage = url.searchParams.get('stage');

  const missing = requireContactIdForNonAdmin(caller, contact_id);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  if (contact_id) {
    const access = await assertCrmContactAccess(admin, caller, contact_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let q = admin
    .from('crm_opportunities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (contact_id) q = q.eq('contact_id', contact_id);
  if (caller.role !== 'admin') q = q.eq('owner_id', caller.id);
  if (stage) q = q.eq('stage', stage);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;

  const body = await req.json();
  const {
    contact_id, contact_name, stage = 'lead',
    estimated_value, expected_close_at, close_probability, notes, source,
  } = body;

  if (!contact_id || !contact_name) {
    return NextResponse.json({ error: 'contact_id and contact_name are required' }, { status: 400 });
  }

  const access = await assertCrmContactAccess(admin, caller, contact_id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('crm_opportunities')
    .insert({
      contact_id,
      contact_name,
      stage,
      estimated_value: estimated_value ?? null,
      expected_close_at: expected_close_at ?? null,
      close_probability: close_probability ?? null,
      notes: notes ?? null,
      source: source ?? null,
      owner_id: caller.id,
      owner_name: caller.full_name ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunity: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;

  const body = await req.json();
  const { id, stage, estimated_value, expected_close_at, close_probability, notes, source } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: existing } = await admin.from('crm_opportunities').select('id, contact_id, owner_id').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await assertCrmContactAccess(admin, caller, existing.contact_id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (caller.role !== 'admin' && existing.owner_id !== caller.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await (admin as any)
    .from('crm_opportunities')
    .update({
      ...(stage !== undefined && { stage }),
      ...(estimated_value !== undefined && { estimated_value }),
      ...(expected_close_at !== undefined && { expected_close_at: expected_close_at || null }),
      ...(close_probability !== undefined && { close_probability }),
      ...(notes !== undefined && { notes }),
      ...(source !== undefined && { source }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunity: data });
}

export async function DELETE(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing } = await admin.from('crm_opportunities').select('id, contact_id, owner_id').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await assertCrmContactAccess(admin, caller, existing.contact_id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (caller.role !== 'admin' && existing.owner_id !== caller.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await admin.from('crm_opportunities').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
