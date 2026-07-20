import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUSES = ['open', 'pending_customer', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

async function actor() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin.from('portal_users').select('id, role, is_active').eq('id', user.id).maybeSingle();
  if (!profile?.is_active) return null;
  return { user, profile, admin };
}

export async function GET(req: NextRequest) {
  const current = await actor();
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const { data: caseRow, error } = await current.admin.from('communication_cases').select('*').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to load case.' }, { status: 500 });
    if (!caseRow) return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    const allowed = current.profile.role === 'admin' || caseRow.assigned_to === current.user.id || caseRow.requester_id === current.user.id;
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { data: events } = await current.admin.from('communication_case_events').select('*').eq('case_id', id).order('created_at', { ascending: true });
    return NextResponse.json({ data: { ...caseRow, events: events ?? [] }, canManage: current.profile.role === 'admin' || caseRow.assigned_to === current.user.id });
  }

  let query = current.admin.from('communication_cases').select('*').order('updated_at', { ascending: false }).limit(200);
  if (current.profile.role === 'teacher') query = query.eq('assigned_to', current.user.id);
  else if (current.profile.role !== 'admin') query = query.eq('requester_id', current.user.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load cases.' }, { status: 500 });
  return NextResponse.json({ data: data ?? [], role: current.profile.role });
}

export async function PATCH(req: NextRequest) {
  const current = await actor();
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Case id is required.' }, { status: 400 });
  const { data: existing } = await current.admin.from('communication_cases').select('*').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  const canManage = current.profile.role === 'admin' || existing.assigned_to === current.user.id;
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    updates.status = body.status;
    if (['resolved', 'closed'].includes(body.status)) updates.resolved_at = new Date().toISOString();
  }
  if (typeof body.priority === 'string') {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: 'Invalid priority.' }, { status: 400 });
    updates.priority = body.priority;
  }
  if (current.profile.role === 'admin' && typeof body.assignedTo === 'string') updates.assigned_to = body.assignedTo || null;
  const { data, error } = await current.admin.from('communication_cases').update(updates).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: 'Unable to update case.' }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
