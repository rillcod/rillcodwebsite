import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cronResultSucceeded } from '@/lib/operations/cron-monitor';
import { cronPathMap, monitoredCronJobs } from '@/lib/operations/cron-registry';

export const dynamic = 'force-dynamic';

// Derived from the registry so this map can no longer drift from the jobs that actually exist.
const CRON_PATHS: Record<string, string> = cronPathMap();

/**
 * `cron_job_health` only gains a row once a job has run at least once, so a job that lost its
 * schedule — or never got one — was simply absent from the panel rather than alarming. Fill in a
 * placeholder for every scheduled job with no row yet; `healthState` renders a null
 * `last_finished_at` as "Waiting for first run".
 */
function withNeverRunJobs(rows: Array<Record<string, unknown>>) {
  const seen = new Set(rows.map((row) => String(row.job_name)));
  const placeholders = monitoredCronJobs()
    .filter((job) => !seen.has(job.name))
    .map((job) => ({
      job_name: job.name,
      expected_interval_minutes: job.intervalMinutes,
      last_started_at: null,
      last_finished_at: null,
      last_success_at: null,
      next_expected_at: null,
      last_status_code: null,
      last_duration_ms: null,
      last_error: null,
      last_result: {},
      consecutive_failures: 0,
      never_run: true,
    }));
  return [...rows, ...placeholders].sort((a, b) => String(a.job_name).localeCompare(String(b.job_name)));
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() as any;
  const { data: profile } = await db.from('portal_users').select('role,is_active,is_deleted').eq('id', user.id).maybeSingle();
  return profile?.role === 'admin' && profile.is_active && !profile.is_deleted ? { user, db } : null;
}

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const [health, deadLetters, history, financeFailures] = await Promise.all([
    actor.db.from('cron_job_health').select('*').order('job_name'),
    actor.db.from('notification_dead_letters').select('*').in('status', ['pending', 'retrying']).order('created_at', { ascending: false }).limit(100),
    actor.db.from('cron_run_history').select('*').order('created_at', { ascending: false }).limit(100),
    actor.db.from('finance_automation_log').select('id,stream,action,entity_id,channel,error,created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(25),
  ]);

  const firstError = health.error || deadLetters.error || history.error || financeFailures.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
  return NextResponse.json({
    health: withNeverRunJobs(health.data ?? []),
    deadLetters: deadLetters.data ?? [],
    history: history.data ?? [],
    financeFailures: financeFailures.data ?? [],
    cronPaths: CRON_PATHS,
    generatedAt: new Date().toISOString(),
  });
}

export async function PATCH(req: NextRequest) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  if (action === 'run_now') {
    const jobName = String(body.jobName || '');
    const path = CRON_PATHS[jobName];
    if (!path) return NextResponse.json({ error: 'Unknown cron job.' }, { status: 400 });
    const secret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET;
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'x-cron-secret': secret },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      const succeeded = cronResultSucceeded(response.status, result);
      return NextResponse.json({ success: succeeded, status: response.status, result }, { status: succeeded ? 200 : 502 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Cron run failed.' }, { status: 502 });
    }
  }

  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'Dead-letter id is required.' }, { status: 400 });
  const { data: row, error: loadError } = await actor.db.from('notification_dead_letters').select('*').eq('id', id).maybeSingle();
  if (loadError || !row) return NextResponse.json({ error: 'Dead-letter item not found.' }, { status: 404 });
  const now = new Date().toISOString();

  if (action === 'resolve' || action === 'ignore') {
    const status = action === 'resolve' ? 'resolved' : 'ignored';
    const { error } = await actor.db.from('notification_dead_letters').update({
      status,
      resolved_at: now,
      resolved_by: actor.user.id,
      resolution_note: String(body.note || (status === 'ignored' ? 'Ignored by administrator.' : 'Resolved by administrator.')).slice(0, 1000),
      updated_at: now,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status });
  }

  if (action === 'retry') {
    if (row.job_type !== 'email') {
      return NextResponse.json({ error: 'This dead-letter type requires manual resolution.' }, { status: 400 });
    }
    const rawPayload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
    const payload = (
      rawPayload.retry && typeof rawPayload.retry === 'object'
        ? rawPayload.retry
        : rawPayload
    ) as Record<string, unknown>;
    if (!row.user_id && !payload.to) {
      return NextResponse.json({ error: 'This dead-letter type requires manual resolution.' }, { status: 400 });
    }
    await actor.db.from('notification_dead_letters').update({ status: 'retrying', last_retry_at: now, updated_at: now }).eq('id', id);
    try {
      const { notificationsService } = await import('@/services/notifications.service');
      let delivered = true;
      if (row.user_id) {
        delivered = await notificationsService.sendEmail(row.user_id, payload as any) === true;
      } else {
        await notificationsService.sendExternalEmail(payload as any);
      }
      if (!delivered) {
        await actor.db.from('notification_dead_letters').update({
          status: 'ignored', retry_count: Number(row.retry_count || 0) + 1,
          last_retry_at: now, resolved_at: now, resolved_by: actor.user.id,
          resolution_note: 'Not sent because the customer has disabled this channel.', updated_at: now,
        }).eq('id', id);
        return NextResponse.json({ success: true, status: 'ignored', delivered: false, reason: 'customer_preference' });
      }
      await actor.db.from('notification_dead_letters').update({
        status: 'resolved', retry_count: Number(row.retry_count || 0) + 1,
        last_retry_at: now, resolved_at: now, resolved_by: actor.user.id,
        resolution_note: 'Delivered successfully by administrator retry.', updated_at: now,
      }).eq('id', id);
      return NextResponse.json({ success: true, status: 'resolved' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await actor.db.from('notification_dead_letters').update({
        status: 'pending', retry_count: Number(row.retry_count || 0) + 1,
        last_retry_at: now, error: message.slice(0, 4000), updated_at: now,
      }).eq('id', id);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
