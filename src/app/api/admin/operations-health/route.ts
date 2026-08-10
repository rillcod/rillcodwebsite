import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cronResultSucceeded } from '@/lib/operations/cron-monitor';
import { cronPathMap, monitoredCronJobs } from '@/lib/operations/cron-registry';
import { logAudit } from '@/lib/audit/log';
import { requireSupabaseWrite } from '@/lib/supabase/require-result';

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

/**
 * Work that is finished and waiting on a person.
 *
 * Every one of these is content somebody already produced, sitting behind the
 * approval gate. The gate is deliberate — a generated plan is a draft because
 * approval is the point — but nothing anywhere counted what had queued up
 * behind it, and a gate with no counter is a drain.
 *
 * Found on 2026-08-07: 82 progress reports written, scored and never published,
 * the oldest four months old. Also 45 plans with auto-generate switched on that
 * the sweep skips because it only takes published ones, and 10 of 11 lessons
 * finished but draft, which also hides their slides and flashcards from
 * learners. None of it was broken. None of it was visible either.
 *
 * Counts only — head:true keeps this cheap enough to sit on a page that polls.
 */
/**
 * Below this, a score was recorded as a non-result rather than earned as a low
 * one — a learner who never really attended, or a shell the builder created and
 * nobody filled in. The Academy reads its own marks this way; it is not derived
 * from the distribution, so it belongs here as a named constant rather than
 * buried in a filter.
 */
const GENUINE_RESULT_MARK = 40;

async function waitingOnYou(db: any) {
  const count = async (
    table: string,
    build: (q: any) => any
  ): Promise<number | null> => {
    try {
      const { count: n, error } = await build(
        db.from(table).select('id', { count: 'exact', head: true })
      );
      return error ? null : (n ?? 0);
    } catch {
      // A panel that half-renders beats a panel that 500s over one count.
      return null;
    }
  };

  const [reports, blankReports, plans, lessons, assignments] = await Promise.all([
    // Split on the mark, not on the flag. is_published=false does double duty:
    // it means "a shell nobody filled in" as often as "finished and not
    // released". All 82 counted together reads as 82 reports owed to parents,
    // and publishing that batch would send most of those families a blank one —
    // average attendance across them is 23, against 69.5 for published reports.
    //
    // The 40 mark is the Academy's own reading of its data, not a statistical
    // guess: anything below it was entered as a non-result rather than earned
    // as a low one. That puts 57 of the 82 on the wrong side of the line, which
    // is why the flag alone could never have answered this.
    count('student_progress_reports', (q: any) =>
      q.not('is_published', 'is', true).gte('overall_score', GENUINE_RESULT_MARK)
    ),
    count('student_progress_reports', (q: any) =>
      q.not('is_published', 'is', true).lt('overall_score', GENUINE_RESULT_MARK)
    ),
    count('lesson_plans', (q: any) =>
      q.eq('status', 'draft').eq('metadata->auto_generate_settings->>enabled', 'true')
    ),
    count('lessons', (q: any) => q.eq('status', 'draft')),
    count('assignments', (q: any) =>
      q.not('is_active', 'is', true).not('metadata->>generated_from', 'is', null)
    ),
  ]);

  return [
    {
      key: 'reports',
      label: 'Marked reports not published',
      detail: 'Scores are in. No parent or learner can see them yet.',
      count: reports,
      href: '/dashboard/results',
    },
    {
      key: 'blank-reports',
      label: `Reports under ${GENUINE_RESULT_MARK} — not real results`,
      detail: 'Shells and non-attenders. Complete or remove them; do not publish.',
      count: blankReports,
      href: '/dashboard/reports/builder',
    },
    {
      key: 'plans',
      label: 'Teaching plans waiting for approval',
      detail: 'Auto-generate is on, but the sweep only picks up published plans.',
      count: plans,
      href: '/dashboard/lesson-plans/approvals',
    },
    {
      key: 'lessons',
      label: 'Lessons finished but still draft',
      detail: 'Their slides and flashcards are hidden from learners too.',
      count: lessons,
      href: '/dashboard/lessons',
    },
    {
      key: 'assignments',
      label: 'Generated assignments not yet active',
      detail: 'Written for a week that has not been released.',
      count: assignments,
      href: '/dashboard/assignments',
    },
  ].filter((row) => row.count === null || row.count > 0);
}

/**
 * Flatten the dispatcher's own record into one row per child job.
 *
 * Stored as `{ host, at, result: { 'academic-readiness': 'ok' | 'http_500' | 'unreachable:…' } }`
 * under a handful of app_settings keys. Reported per child rather than per host
 * because "onboarding-sweep's fan-out failed" is not actionable, while
 * "academic-readiness was unreachable at 18:00" names the job that stopped.
 */
function summariseFanout(rows: Array<Record<string, unknown>>) {
  const children: Array<{ job: string; status: string; host: string; at: string | null }> = [];

  for (const row of rows) {
    let parsed: { host?: string; at?: string; result?: Record<string, string> } | null = null;
    try {
      const raw = row.value;
      parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof parsed);
    } catch {
      continue; // A malformed record must not take the whole panel down.
    }
    if (!parsed?.result) continue;

    for (const [job, status] of Object.entries(parsed.result)) {
      children.push({
        job,
        status: String(status),
        host: String(parsed.host ?? row.key ?? 'unknown'),
        at: parsed.at ?? (row.updated_at as string) ?? null,
      });
    }
  }

  children.sort((a, b) => a.job.localeCompare(b.job));
  const failing = children.filter((c) => c.status !== 'ok');

  return {
    children,
    failing,
    // True when the dispatcher is reaching nothing at all — the shape of the
    // 2026-08-07 outage, and a different problem from one job returning 500.
    allUnreachable:
      children.length > 0 && children.every((c) => c.status.startsWith('unreachable')),
  };
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const db = createAdminClient() as any;
  const { data: profile, error } = await db.from('portal_users').select('role,is_active,is_deleted').eq('id', user.id).maybeSingle();
  if (error) throw new Error(`Admin access lookup failed: ${error.message}`);
  return profile?.role === 'admin' && profile.is_active && !profile.is_deleted ? { user, db } : null;
}

export async function GET() {
  let actor: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    actor = await requireAdmin();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin access lookup failed' }, { status: 500 });
  }
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const [health, deadLetters, history, financeFailures, generationIncidents, fanout] = await Promise.all([
    actor.db.from('cron_job_health').select('*').order('job_name'),
    actor.db.from('notification_dead_letters').select('*').in('status', ['pending', 'retrying']).order('created_at', { ascending: false }).limit(100),
    actor.db.from('cron_run_history').select('*').order('created_at', { ascending: false }).limit(100),
    actor.db.from('finance_automation_log').select('id,stream,action,entity_id,channel,error,created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(25),
    actor.db
      .from('lesson_plans')
      .select('id,metadata,classes!lesson_plans_class_id_fkey(name),courses(title)')
      .not('metadata->last_generation_errors', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(50),
    // Nine jobs are dispatched by fan-out rather than by the scheduler, and the
    // dispatcher already recorded every result here. Nothing read it. On
    // 2026-08-07 every dispatch had been failing for days — the container
    // cannot reach its own public origin — and the panel showed nothing wrong,
    // because a job that is never invoked never records a failure. It only has
    // an old last_success_at, which reads as "quiet", not "broken".
    actor.db
      .from('app_settings')
      .select('key,value,updated_at')
      .like('key', 'cron_%_last_%fanout'),
  ]);

  const firstError = health.error || deadLetters.error || history.error || financeFailures.error || generationIncidents.error || fanout.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
  const incidents = (generationIncidents.data ?? []).flatMap((row: any) => {
    const errors = row?.metadata?.last_generation_errors;
    if (!errors || typeof errors !== 'object') return [];
    const generatedAt = typeof errors.generated_at === 'string' ? errors.generated_at : null;
    return ['lessons', 'slides', 'flashcards', 'assignments', 'projects']
      .filter((key) => Array.isArray((errors as Record<string, unknown>)[key]))
      .map((key) => ({
        planId: row.id,
        className: row?.classes?.name ?? null,
        courseTitle: row?.courses?.title ?? null,
        type: key,
        failures: ((errors as Record<string, unknown>)[key] as unknown[]).length,
        generatedAt,
      }));
  });
  return NextResponse.json({
    health: withNeverRunJobs(health.data ?? []),
    deadLetters: deadLetters.data ?? [],
    history: history.data ?? [],
    financeFailures: financeFailures.data ?? [],
    generationIncidents: incidents,
    fanout: summariseFanout(fanout.data ?? []),
    waiting: await waitingOnYou(actor.db),
    cronPaths: CRON_PATHS,
    generatedAt: new Date().toISOString(),
  });
}

export async function PATCH(req: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    actor = await requireAdmin();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin access lookup failed' }, { status: 500 });
  }
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
      await logAudit(actor.db, {
        action: succeeded ? 'run_automation_job_now' : 'run_automation_job_now_failed',
        actorId: actor.user.id, resourceType: 'cron_job', resourceId: jobName,
        newValue: succeeded ? `Ran ${jobName} successfully` : `${jobName} returned HTTP ${response.status}`,
        newValues: { path, http_status: response.status },
      });
      return NextResponse.json({ success: succeeded, status: response.status, result }, { status: succeeded ? 200 : 502 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cron run failed.';
      await logAudit(actor.db, {
        action: 'run_automation_job_now_failed', actorId: actor.user.id,
        resourceType: 'cron_job', resourceId: jobName, newValue: message,
        newValues: { path },
      });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const id = String(body.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'A valid dead-letter id is required.' }, { status: 400 });
  }
  const { data: row, error: loadError } = await actor.db.from('notification_dead_letters').select('*').eq('id', id).maybeSingle();
  if (loadError || !row) return NextResponse.json({ error: 'Dead-letter item not found.' }, { status: 404 });
  const now = new Date().toISOString();

  if (action === 'resolve' || action === 'ignore') {
    if (['resolved', 'ignored'].includes(String(row.status))) {
      return NextResponse.json({ error: 'This dead-letter item is already closed.' }, { status: 409 });
    }
    const status = action === 'resolve' ? 'resolved' : 'ignored';
    const note = String(body.note || (status === 'ignored' ? 'Ignored by administrator.' : 'Resolved by administrator.')).trim().slice(0, 1000);
    if (!note) return NextResponse.json({ error: 'A resolution note is required.' }, { status: 400 });
    const { data: updated, error } = await actor.db.from('notification_dead_letters').update({
      status,
      resolved_at: now,
      resolved_by: actor.user.id,
      resolution_note: note,
      updated_at: now,
    }).eq('id', id).eq('status', row.status).select('id,status').maybeSingle();
    if (error || !updated) return NextResponse.json({ error: error?.message || 'Dead-letter item changed before it could be closed.' }, { status: error ? 500 : 409 });
    await logAudit(actor.db, {
      action: status === 'resolved' ? 'resolve_notification_dead_letter' : 'ignore_notification_dead_letter',
      actorId: actor.user.id, resourceType: 'notification_dead_letter', resourceId: id,
      tableName: 'notification_dead_letters',
      oldValue: String(row.status || 'pending'), newValue: status,
      oldValues: { status: row.status, retry_count: row.retry_count, error: row.error },
      newValues: { status, resolution_note: note },
    });
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
    try {
      await requireSupabaseWrite(
        actor.db.from('notification_dead_letters').update({ status: 'retrying', last_retry_at: now, updated_at: now }).eq('id', id),
        'Mark notification for retry',
      );
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
    try {
      const { notificationsService } = await import('@/services/notifications.service');
      let delivered = true;
      if (row.user_id) {
        delivered = await notificationsService.sendEmail(row.user_id, payload as any) === true;
      } else {
        await notificationsService.sendExternalEmail(payload as any);
      }
      if (!delivered) {
        await requireSupabaseWrite(
          actor.db.from('notification_dead_letters').update({
            status: 'ignored', retry_count: Number(row.retry_count || 0) + 1,
            last_retry_at: now, resolved_at: now, resolved_by: actor.user.id,
            resolution_note: 'Not sent because the customer has disabled this channel.', updated_at: now,
          }).eq('id', id),
          'Record notification preference skip',
        );
        await logAudit(actor.db, {
          action: 'retry_notification_dead_letter_skipped', actorId: actor.user.id,
          resourceType: 'notification_dead_letter', resourceId: id,
          oldValue: String(row.status || 'pending'), newValue: 'ignored',
        });
        return NextResponse.json({ success: true, status: 'ignored', delivered: false, reason: 'customer_preference' });
      }
      await requireSupabaseWrite(
        actor.db.from('notification_dead_letters').update({
          status: 'resolved', retry_count: Number(row.retry_count || 0) + 1,
          last_retry_at: now, resolved_at: now, resolved_by: actor.user.id,
          resolution_note: 'Delivered successfully by administrator retry.', updated_at: now,
        }).eq('id', id),
        'Record successful notification retry',
      );
      await logAudit(actor.db, {
        action: 'retry_notification_dead_letter', actorId: actor.user.id,
        resourceType: 'notification_dead_letter', resourceId: id,
        oldValue: String(row.status || 'pending'), newValue: 'resolved',
      });
      return NextResponse.json({ success: true, status: 'resolved' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let stateError: string | null = null;
      try {
        await requireSupabaseWrite(
          actor.db.from('notification_dead_letters').update({
            status: 'pending', retry_count: Number(row.retry_count || 0) + 1,
            last_retry_at: now, error: message.slice(0, 4000), updated_at: now,
          }).eq('id', id),
          'Restore notification after failed retry',
        );
      } catch (writeError) {
        stateError = writeError instanceof Error ? writeError.message : String(writeError);
      }
      await logAudit(actor.db, {
        action: 'retry_notification_dead_letter_failed', actorId: actor.user.id,
        resourceType: 'notification_dead_letter', resourceId: id, newValue: message,
        newValues: { state_error: stateError },
      });
      return NextResponse.json({ error: message, state_error: stateError }, { status: stateError ? 500 : 502 });
    }
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
