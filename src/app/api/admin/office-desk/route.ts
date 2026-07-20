import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CLOSED = new Set(['resolved', 'closed']);

function friendlyKind(title: string, type?: string | null) {
  const text = `${title} ${type || ''}`.toLowerCase();
  if (text.includes('assignment')) return 'Assignment';
  if (text.includes('result') || text.includes('grade') || text.includes('report')) return 'Result or report';
  if (text.includes('onboard') || text.includes('welcome') || text.includes('registration')) return 'Onboarding';
  if (text.includes('invoice') || text.includes('payment') || text.includes('balance') || text.includes('billing')) return 'Payment';
  if (text.includes('class') || text.includes('session')) return 'Class or session';
  if (text.includes('certificate')) return 'Certificate';
  return 'General update';
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db.from('portal_users').select('role,is_active').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin' || !profile.is_active) {
    return NextResponse.json({ error: 'This page is for the office administrator.' }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [casesResult, noticesResult, deliveriesResult, healthResult] = await Promise.all([
    db.from('communication_cases')
      .select('id,requester_name,requester_email,subject,status,priority,assigned_to,next_action,next_action_due_at,sensitivity,restricted,updated_at')
      .order('updated_at', { ascending: false }).limit(120),
    db.from('notifications')
      .select('id,user_id,title,message,type,action_url,delivery_status,notification_channel,created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(160),
    db.from('communication_delivery_log')
      .select('id,recipient,channel,status,error,metadata,created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(160),
    db.from('cron_job_health').select('job_name,last_finished_at,consecutive_failures,next_expected_at'),
  ]);
  const error = casesResult.error || noticesResult.error || deliveriesResult.error || healthResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cases = casesResult.data ?? [];
  const notices = noticesResult.data ?? [];
  const deliveries = deliveriesResult.data ?? [];
  const userIds = [...new Set([
    ...cases.map((row: any) => row.assigned_to),
    ...notices.map((row: any) => row.user_id),
  ].filter(Boolean))];
  const { data: people } = userIds.length
    ? await db.from('portal_users').select('id,full_name,email').in('id', userIds)
    : { data: [] };
  const names = new Map((people ?? []).map((person: any) => [person.id, person.full_name || person.email || 'Unnamed person']));
  const emailNames = new Map((people ?? []).filter((person: any) => person.email).map((person: any) => [String(person.email).toLowerCase(), person.full_name || person.email]));

  const now = Date.now();
  const activeCases = cases.filter((row: any) => !CLOSED.has(row.status));
  const attention = activeCases.map((row: any) => ({
    id: `case-${row.id}`,
    caseId: row.id,
    person: row.requester_name || row.requester_email || 'Customer name not supplied',
    item: row.subject,
    owner: row.assigned_to ? names.get(row.assigned_to) || 'Assigned staff' : 'Not assigned yet',
    reason: row.restricted ? 'Needs careful human handling' : !row.assigned_to ? 'Choose a staff member' : row.next_action_due_at && new Date(row.next_action_due_at).getTime() < now ? 'Next action is late' : 'Open work',
    nextAction: row.next_action || (!row.assigned_to ? 'Assign a staff member' : 'Review and reply'),
    dueAt: row.next_action_due_at,
    priority: row.priority,
    restricted: row.restricted === true,
    updatedAt: row.updated_at,
  })).sort((a: any, b: any) => Number(b.restricted) - Number(a.restricted) || Number(!a.owner.includes('Not assigned')) - Number(!b.owner.includes('Not assigned')) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const activity = [
    ...notices.map((row: any) => ({
      id: `notice-${row.id}`,
      person: names.get(row.user_id) || 'Recipient name unavailable',
      item: row.title,
      kind: friendlyKind(row.title, row.type),
      summary: row.message,
      channel: row.notification_channel || 'In the app',
      result: row.delivery_status || 'Recorded',
      link: row.action_url,
      createdAt: row.created_at,
    })),
    ...deliveries.map((row: any) => ({
      id: `delivery-${row.id}`,
      person: emailNames.get(String(row.recipient || '').toLowerCase()) || row.recipient || 'Recipient not recorded',
      item: row.metadata?.subject || row.metadata?.eventType || row.metadata?.event_type || 'Office message',
      kind: friendlyKind(row.metadata?.subject || '', row.metadata?.eventType || row.metadata?.event_type),
      summary: row.error || (row.status === 'failed' ? 'The message was not delivered.' : 'The office sent this automatically.'),
      channel: row.channel,
      result: row.status,
      link: null,
      createdAt: row.created_at,
    })),
  ].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 240);

  const jobs = healthResult.data ?? [];
  const automationProblems = jobs.filter((job: any) => Number(job.consecutive_failures || 0) > 0 || (job.next_expected_at && new Date(job.next_expected_at).getTime() + 15 * 60000 < now));
  return NextResponse.json({
    summary: {
      needsAttention: attention.length,
      unassigned: activeCases.filter((row: any) => !row.assigned_to).length,
      failedMessages: deliveries.filter((row: any) => row.status === 'failed').length,
      successfulMessages: deliveries.filter((row: any) => ['sent', 'delivered', 'read'].includes(row.status)).length,
      automationProblems: automationProblems.length,
      automationHealthy: Math.max(0, jobs.length - automationProblems.length),
    },
    attention,
    activity,
  });
}
