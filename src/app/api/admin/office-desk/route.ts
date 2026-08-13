import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildAttentionReason, evaluateCaseAttention } from '@/lib/operations/attention-rules';
import { getOfficeAdminActor, officeAdminForbiddenResponse, officeAdminUnauthorizedResponse } from '@/lib/operations/access';
import {
  cronNeedsAttention,
  currentFinanceIncidents,
  generationIncidentsFromPlans,
  summariseFanoutState,
  withRegisteredCronJobs,
} from '@/lib/operations/health-state';

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
  const actor = await getOfficeAdminActor();
  if (!actor) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: officeAdminUnauthorizedResponse().error }, { status: 401 });
    return NextResponse.json({ error: officeAdminForbiddenResponse().error }, { status: 403 });
  }

  const db = actor.admin as any;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [
    casesResult,
    noticesResult,
    deliveriesResult,
    healthResult,
    deadLettersResult,
    financeStateResult,
    generationResult,
    fanoutResult,
  ] = await Promise.all([
    db.from('communication_cases')
      .select('id,requester_name,requester_email,subject,status,priority,assigned_to,next_action,next_action_due_at,first_response_due_at,sensitivity,restricted,created_at,updated_at')
      .order('updated_at', { ascending: false }).limit(120),
    db.from('notifications')
      .select('id,user_id,title,message,type,action_url,delivery_status,notification_channel,created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(160),
    db.from('communication_delivery_log')
      .select('id,case_id,recipient,channel,status,error,metadata,created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(160),
    db.from('cron_job_health').select('job_name,last_finished_at,consecutive_failures,next_expected_at'),
    db.from('notification_dead_letters')
      .select('id,source,job_type,user_id,error,created_at')
      .in('status', ['pending', 'retrying'])
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('finance_automation_log')
      .select('id,stream,action,entity_type,entity_id,stage,channel,status,error,attempt,created_at')
      .in('status', ['failed', 'success', 'skipped'])
      .order('created_at', { ascending: false })
      .limit(500),
    db.from('lesson_plans')
      .select('id,metadata,classes!lesson_plans_class_id_fkey(name),courses(title)')
      .not('metadata->last_generation_errors', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(50),
    db.from('app_settings')
      .select('key,value,updated_at')
      .like('key', 'cron_%_last_%fanout'),
  ]);
  const error = casesResult.error || noticesResult.error || deliveriesResult.error || healthResult.error
    || deadLettersResult.error || financeStateResult.error || generationResult.error || fanoutResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cases = casesResult.data ?? [];
  const notices = noticesResult.data ?? [];
  const deliveries = deliveriesResult.data ?? [];
  const deadLetters = deadLettersResult.data ?? [];
  const userIds = [...new Set([
    ...cases.map((row: any) => row.assigned_to),
    ...notices.map((row: any) => row.user_id),
    ...deadLetters.map((row: any) => row.user_id),
  ].filter(Boolean))];
  const { data: people, error: peopleError } = userIds.length
    ? await db.from('portal_users').select('id,full_name,email').in('id', userIds)
    : { data: [], error: null };
  if (peopleError) return NextResponse.json({ error: peopleError.message }, { status: 500 });
  const names = new Map((people ?? []).map((person: any) => [person.id, person.full_name || person.email || 'Unnamed person']));
  const emailNames = new Map((people ?? []).filter((person: any) => person.email).map((person: any) => [String(person.email).toLowerCase(), person.full_name || person.email]));

  const now = Date.now();
  const activeCases = cases.filter((row: any) => !CLOSED.has(row.status));
  const attention = activeCases
    .map((row: any) => {
      const evaluation = evaluateCaseAttention(row, now);
      return {
        row,
        evaluation,
        item: {
          id: `case-${row.id}`,
          caseId: row.id,
          person: row.requester_name || row.requester_email || 'Customer name not supplied',
          item: row.subject,
          owner: row.assigned_to ? names.get(row.assigned_to) || 'Assigned staff' : 'Not assigned yet',
          assignedToId: row.assigned_to || null,
          reason: buildAttentionReason(row, evaluation),
          nextAction: row.next_action || (!row.assigned_to ? 'Assign a staff member' : 'Review and reply'),
          dueAt: row.next_action_due_at,
          priority: row.priority,
          restricted: row.restricted === true,
          updatedAt: row.updated_at,
          needsAttention: evaluation.needsAttention,
        },
      };
    })
    .filter((entry: { evaluation: { needsAttention: boolean } }) => entry.evaluation.needsAttention)
    .map((entry: { item: (typeof attention)[number] }) => entry.item)
    .sort((a: any, b: any) => Number(b.restricted) - Number(a.restricted) || Number(!a.owner.includes('Not assigned')) - Number(!b.owner.includes('Not assigned')) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  for (const failure of deadLetters.slice(0, 12)) {
    attention.push({
      id: `delivery-help-${failure.id}`,
      caseId: null,
      openTarget: 'health',
      person: names.get(failure.user_id) || 'Recipient details available in Scheduled Work',
      item: `${String(failure.job_type || 'Message').replace(/[-_.]+/g, ' ')} delivery`,
      owner: 'Delivery system',
      assignedToId: null,
      reason: 'Delivery still needs help',
      nextAction: 'Retry or close it in Scheduled Work',
      dueAt: null,
      priority: 'high',
      restricted: false,
      updatedAt: failure.created_at,
      needsAttention: true,
    });
  }

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
      link: row.case_id ? `/dashboard/office?workspace=cases&id=${row.case_id}` : null,
      createdAt: row.created_at,
    })),
  ].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 240);

  const jobs = withRegisteredCronJobs(healthResult.data ?? []);
  const cronProblems = jobs.filter((job) => cronNeedsAttention(job, now));
  const financeProblems = currentFinanceIncidents(financeStateResult.data ?? []);
  const generationProblems = generationIncidentsFromPlans(generationResult.data ?? []);
  const fanoutProblems = summariseFanoutState(fanoutResult.data ?? []).failing;
  const automationProblems = cronProblems.length + financeProblems.length + generationProblems.length + fanoutProblems.length;
  return NextResponse.json({
    viewerId: actor.user.id,
    summary: {
      needsAttention: attention.length,
      unassigned: activeCases.filter((row: any) => !row.assigned_to).length,
      // Historical failed delivery rows stay in Activity. This card counts only
      // durable open items so a later retry/closure actually clears the Desk.
      failedMessages: deadLetters.length,
      successfulMessages: deliveries.filter((row: any) => ['sent', 'delivered', 'read'].includes(row.status)).length,
      automationProblems,
      automationHealthy: Math.max(0, jobs.length - cronProblems.length),
    },
    attention,
    activity,
  });
}
