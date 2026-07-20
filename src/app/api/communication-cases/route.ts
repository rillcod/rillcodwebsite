import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUSES = ['open', 'reopened', 'pending_customer', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

async function actor() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin.from('portal_users').select('id, role, is_active,is_deleted').eq('id', user.id).maybeSingle();
  if (!profile?.is_active || profile.is_deleted) return null;
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
    const [{ data: delivery }, { data: incident }] = await Promise.all([
      current.admin.from('communication_delivery_log').select('*').eq('case_id', id).order('created_at', { ascending: true }),
      current.profile.role === 'admin'
        ? current.admin.from('safeguarding_incidents').select('*').eq('case_id', id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const { data: staff } = current.profile.role === 'admin'
      ? await current.admin.from('portal_users').select('id,full_name,role').eq('is_active', true).in('role', ['admin', 'teacher']).order('full_name')
      : { data: [] };
    const assignedName = (staff ?? []).find((person: any) => person.id === caseRow.assigned_to)?.full_name || null;
    return NextResponse.json({
      data: { ...caseRow, assigned_name: assignedName, events: events ?? [], delivery: delivery ?? [], incident: incident ?? null },
      staff: staff ?? [],
      canManage: current.profile.role === 'admin' || caseRow.assigned_to === current.user.id,
    });
  }

  let query = current.admin.from('communication_cases').select('*').order('updated_at', { ascending: false }).limit(200);
  if (current.profile.role === 'teacher') query = query.eq('assigned_to', current.user.id);
  else if (current.profile.role !== 'admin') query = query.eq('requester_id', current.user.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load cases.' }, { status: 500 });
  const { data: staff } = current.profile.role === 'admin'
    ? await current.admin.from('portal_users').select('id,full_name,role').eq('is_active', true).in('role', ['admin', 'teacher']).order('full_name')
    : { data: [] };
  const names = new Map((staff ?? []).map((person: any) => [person.id, person.full_name || 'Staff member']));
  const rows = (data ?? []).map((row: any) => ({ ...row, assigned_name: row.assigned_to ? names.get(row.assigned_to) || 'Assigned staff' : null }));
  return NextResponse.json({ data: rows, staff: staff ?? [], role: current.profile.role });
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
  const satisfactionScore = Number(body.satisfactionScore || 0);
  const requesterCanRate = existing.requester_id === current.user.id && satisfactionScore >= 1 && satisfactionScore <= 5 && ['resolved', 'closed'].includes(existing.status);
  if (!canManage && !requesterCanRate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (requesterCanRate) {
    const outcome = typeof body.outcome === 'string' ? body.outcome.trim().slice(0, 1000) : null;
    const { data, error } = await current.admin.from('communication_cases').update({
      satisfaction_score: satisfactionScore, outcome, updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error) return NextResponse.json({ error: 'Unable to save outcome.' }, { status: 500 });
    await current.admin.from('customer_value_outcomes').insert({
      case_id: id, portal_user_id: current.user.id,
      outcome_type: satisfactionScore >= 4 ? 'helpful' : 'not_helpful', score: satisfactionScore, comment: outcome,
    });
    return NextResponse.json({ success: true, data });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    updates.status = body.status;
    if (['resolved', 'closed'].includes(body.status)) {
      updates.resolved_at = new Date().toISOString();
      updates.next_action = 'Await customer satisfaction and outcome';
      updates.next_action_due_at = null;
      updates.satisfaction_requested_at = new Date().toISOString();
    }
    if (body.status === 'reopened') {
      updates.resolved_at = null; updates.reopened_count = Number(existing.reopened_count || 0) + 1;
      updates.next_action = 'Review reopened request and respond'; updates.next_action_due_at = new Date(Date.now() + 2 * 3600000).toISOString();
    }
  }
  if (typeof body.priority === 'string') {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: 'Invalid priority.' }, { status: 400 });
    updates.priority = body.priority;
  }
  if (current.profile.role === 'admin' && typeof body.assignedTo === 'string') {
    const assignedTo = body.assignedTo.trim();
    if (!assignedTo) updates.assigned_to = null;
    else {
      const { data: owner } = await current.admin.from('portal_users').select('id,role,is_active').eq('id', assignedTo).maybeSingle();
      const roleAllowed = existing.restricted ? owner?.role === 'admin' : ['admin', 'teacher'].includes(owner?.role || '');
      if (!owner?.is_active || !roleAllowed) {
        return NextResponse.json({ error: existing.restricted ? 'Private work can only be assigned to an active administrator.' : 'Choose an active teacher or administrator.' }, { status: 400 });
      }
      updates.assigned_to = owner.id;
    }
  }
  if (typeof body.nextAction === 'string') {
    const nextAction = body.nextAction.trim().slice(0, 500);
    if (!nextAction) return NextResponse.json({ error: 'Next action cannot be empty.' }, { status: 400 });
    updates.next_action = nextAction;
  }
  if (body.nextActionDueAt === null) updates.next_action_due_at = null;
  else if (typeof body.nextActionDueAt === 'string') {
    const due = new Date(body.nextActionDueAt);
    if (Number.isNaN(due.getTime())) return NextResponse.json({ error: 'Invalid next-action due date.' }, { status: 400 });
    updates.next_action_due_at = due.toISOString();
  }
  const { data, error } = await current.admin.from('communication_cases').update(updates).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: 'Unable to update case.' }, { status: 500 });
  await current.admin.from('communication_case_events').insert({
    case_id: id, channel: 'system', direction: 'internal', source_type: 'case_update', source_id: crypto.randomUUID(),
    subject: 'Case workflow updated', body: `Status: ${data.status}. Next action: ${data.next_action || 'none'}`,
    actor_id: current.user.id, metadata: { changed_fields: Object.keys(updates) }, automated: false,
  });
  return NextResponse.json({ success: true, data });
}
