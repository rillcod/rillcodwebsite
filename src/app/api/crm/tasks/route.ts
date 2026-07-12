import { NextRequest, NextResponse } from 'next/server';
import { requireCrmStaffOrNull } from '@/lib/crm/auth';
import { assertCrmContactAccess, requireContactIdForNonAdmin } from '@/lib/crm/scope';

// GET /api/crm/tasks?contact_id=&mine=1&overdue=1&status=all
export async function GET(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;
  const url = new URL(req.url);
  const mine = url.searchParams.get('mine') === '1';
  const overdue = url.searchParams.get('overdue') === '1';
  const status = url.searchParams.get('status') || 'all';
  const contact_id = url.searchParams.get('contact_id');
  const nowIso = new Date().toISOString();

  const missing = requireContactIdForNonAdmin(caller, contact_id);
  if (missing && !mine) return NextResponse.json({ error: missing }, { status: 400 });

  if (contact_id) {
    const access = await assertCrmContactAccess(admin, caller, contact_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let q = admin
    .from('crm_tasks')
    .select('id, contact_id, contact_name, title, due_at, priority, status, owner_id, owner_name, created_by, created_at, updated_at')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(150);
  if (contact_id) q = q.eq('contact_id', contact_id);
  if (mine || caller.role !== 'admin') q = q.eq('owner_id', caller.id);
  if (status !== 'all') q = q.eq('status', status);
  if (overdue) q = q.not('due_at', 'is', null).lt('due_at', nowIso).in('status', ['open', 'in_progress']);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;

  const body = await req.json();
  const { contact_id, contact_name, title, due_at, priority = 'normal', owner_id, owner_name } = body;

  if (!contact_id || !contact_name || !title?.trim()) {
    return NextResponse.json({ error: 'contact_id, contact_name and title are required' }, { status: 400 });
  }

  const access = await assertCrmContactAccess(admin, caller, contact_id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('crm_tasks')
    .insert({
      contact_id,
      contact_name,
      title: title.trim(),
      due_at: due_at || null,
      priority,
      status: 'open',
      owner_id: owner_id || caller.id,
      owner_name: owner_name || caller.full_name || null,
      created_by: caller.id,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;

  const body = await req.json();
  const { id, title, due_at, priority, status, owner_id, owner_name } = body;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: existing } = await admin.from('crm_tasks').select('id, contact_id, owner_id').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await assertCrmContactAccess(admin, caller, existing.contact_id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (caller.role !== 'admin' && existing.owner_id !== caller.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await (admin as any)
    .from('crm_tasks')
    .update({
      ...(title !== undefined && { title }),
      ...(due_at !== undefined && { due_at: due_at || null }),
      ...(priority !== undefined && { priority }),
      ...(status !== undefined && { status }),
      ...(owner_id !== undefined && caller.role === 'admin' && { owner_id }),
      ...(owner_name !== undefined && caller.role === 'admin' && { owner_name }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest) {
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing } = await admin.from('crm_tasks').select('id, contact_id, owner_id').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await assertCrmContactAccess(admin, caller, existing.contact_id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (caller.role !== 'admin' && existing.owner_id !== caller.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await admin.from('crm_tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
