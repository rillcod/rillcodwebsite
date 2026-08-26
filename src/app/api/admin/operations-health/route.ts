import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cronResultSucceeded } from '@/lib/operations/cron-monitor';
import { cronPathMap } from '@/lib/operations/cron-registry';
import {
  currentFinanceIncidents,
  generationIncidentsFromPlans,
  summariseFanoutState,
  withRegisteredCronJobs,
} from '@/lib/operations/health-state';
import { fanoutOriginCandidates } from '@/lib/server/cron-fanout';
import { logAudit } from '@/lib/audit/log';
import { requireSupabaseWrite } from '@/lib/supabase/require-result';
import { loadTrafficControls } from '@/lib/operations/traffic-controls';
import { resolveUpstashConfig } from '@/lib/redis-config';

export const dynamic = 'force-dynamic';

// Derived from the registry so this map can no longer drift from the jobs that actually exist.
const CRON_PATHS: Record<string, string> = cronPathMap();

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

async function securityObservationHealth(db: any) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db.from('security_observations')
      .select('effective_directive,violated_directive,blocked_origin,observed_at')
      .eq('kind', 'csp')
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = data ?? [];
    const byDirective = new Map<string, number>();
    for (const row of rows) {
      const label = String(row.effective_directive || row.violated_directive || 'Other policy');
      byDirective.set(label, (byDirective.get(label) || 0) + 1);
    }
    return {
      available: true,
      last24Hours: rows.length,
      latestAt: rows[0]?.observed_at ?? null,
      topDirectives: [...byDirective.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([directive, count]) => ({ directive, count })),
    };
  } catch (error) {
    console.warn('[operations-health] security observation summary unavailable', error);
    return { available: false, last24Hours: 0, latestAt: null, topDirectives: [] };
  }
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

  const [health, deadLetters, history, financeFailures, generationIncidents, fanout, trafficControls] = await Promise.all([
    actor.db.from('cron_job_health').select('*').order('job_name'),
    actor.db.from('notification_dead_letters').select('*').in('status', ['pending', 'retrying']).order('created_at', { ascending: false }).limit(100),
    actor.db.from('cron_run_history').select('*').order('created_at', { ascending: false }).limit(100),
    // Read state transitions, not only failure rows. A later success closes the
    // incident and must remove the old failure from the staff action queue.
    actor.db.from('finance_automation_log')
      .select('id,stream,action,entity_type,entity_id,stage,channel,status,error,attempt,created_at')
      .in('status', ['failed', 'success', 'skipped'])
      .order('created_at', { ascending: false })
      .limit(500),
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
    loadTrafficControls(actor.db),
  ]);

  const firstError = health.error || deadLetters.error || history.error || financeFailures.error || generationIncidents.error || fanout.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
  const incidents = generationIncidentsFromPlans(generationIncidents.data ?? []);
  return NextResponse.json({
    health: withRegisteredCronJobs(health.data ?? []),
    // The UI needs an action decision, not the original message payload. Keep
    // customer content and delivery credentials out of this administrative response.
    deadLetters: (deadLetters.data ?? []).map((row: any) => ({
      id: row.id,
      source: row.source,
      job_type: row.job_type,
      error: row.error,
      attempts: row.attempts,
      retry_count: row.retry_count,
      status: row.status,
      created_at: row.created_at,
      can_retry:
        (row.job_type === 'email' && Boolean(row.user_id || row.payload?.to || row.payload?.retry?.to)) ||
        (row.job_type === 'whatsapp' && Boolean(row.payload?.phone || row.payload?.retry?.phone)) ||
        (row.job_type === 'in_app' && Boolean(row.payload?.userId || row.user_id)) ||
        (row.job_type === 'assignment_release' && Boolean(row.payload?.assignmentId || row.payload?.retry?.assignmentId)) ||
        row.job_type === 'progress_report_delivery',
    })),
    history: history.data ?? [],
    financeFailures: currentFinanceIncidents(financeFailures.data ?? []).slice(0, 25),
    generationIncidents: incidents,
    fanout: summariseFanoutState(fanout.data ?? []),
    trafficProtection: {
      ...trafficControls,
      sharedStoreConfigured: Boolean(resolveUpstashConfig(
        process.env.UPSTASH_REDIS_REST_URL,
        process.env.UPSTASH_REDIS_REST_TOKEN,
        'operations-health',
      )),
    },
    securityObservations: await securityObservationHealth(actor.db),
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
    try {
      // A Cloudflare container cannot reliably leave the edge and call its own
      // public origin. Use the same loopback-first strategy as scheduled fan-out.
      let response: Response | null = null;
      let lastError: unknown = null;
      for (const origin of fanoutOriginCandidates(req.url)) {
        try {
          response = await fetch(`${origin}${path}`, {
            method: 'POST',
            headers: { 'x-cron-secret': secret },
            cache: 'no-store',
          });
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!response) {
        throw lastError instanceof Error ? lastError : new Error('The scheduled job could not be reached.');
      }
      const result = await response.json().catch(() => ({}));
      const succeeded = cronResultSucceeded(response.status, result);
      const skipped = result?.skipped === true && result?.reason === 'already_running';
      const monitoringUnavailable = response.headers.get('x-rillcod-monitoring') === 'unavailable';
      await logAudit(actor.db, {
        action: skipped ? 'automation_job_overlap_prevented' : succeeded ? 'run_automation_job_now' : 'run_automation_job_now_failed',
        actorId: actor.user.id, resourceType: 'cron_job', resourceId: jobName,
        newValue: skipped ? `${jobName} was already running` : succeeded ? `Ran ${jobName} successfully` : `${jobName} returned HTTP ${response.status}`,
        newValues: { path, http_status: response.status, skipped, monitoring_available: !monitoringUnavailable },
      });
      const warning = skipped
        ? 'This job is already running. A second copy was safely prevented.'
        : monitoringUnavailable
          ? 'The job completed, but its operational history could not be saved. Check the database connection before running it again.'
          : null;
      return NextResponse.json({ success: succeeded, skipped, status: response.status, result, warning }, { status: succeeded ? 200 : 502 });
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
    if (!['email', 'whatsapp', 'in_app', 'assignment_release', 'progress_report_delivery'].includes(String(row.job_type))) {
      return NextResponse.json({ error: 'This dead-letter type requires manual resolution.' }, { status: 400 });
    }
    const rawPayload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
    const payload = (
      rawPayload.retry && typeof rawPayload.retry === 'object'
        ? rawPayload.retry
        : rawPayload
    ) as Record<string, unknown>;
    if (row.job_type === 'email' && !row.user_id && !payload.to) {
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
      if (row.job_type === 'email') {
        if (row.user_id) {
          delivered = await notificationsService.sendEmail(row.user_id, payload as any) === true;
        } else {
          await notificationsService.sendExternalEmail(payload as any);
        }
      } else if (row.job_type === 'whatsapp') {
        const { enqueueWhatsApp } = await import('@/lib/whatsapp/send');
        const queued = await enqueueWhatsApp(actor.db as any, payload as any);
        if (!queued.queued) throw new Error(queued.error || 'WhatsApp alert could not be queued.');
      } else if (row.job_type === 'in_app') {
        const userId = String(payload.userId || row.user_id || '');
        const title = String(payload.title || 'Progress Report Published — Rillcod Technologies');
        const message = String(payload.message || 'A progress report is now available.');
        if (!userId) throw new Error('The in-app recipient is missing.');
        await requireSupabaseWrite(actor.db.from('notifications').insert({
          user_id: userId,
          title,
          message,
          type: 'info',
          is_read: false,
          action_url: payload.actionUrl ? String(payload.actionUrl) : null,
          created_at: now,
          updated_at: now,
        }), 'Retry in-app notification');
      } else if (row.job_type === 'assignment_release') {
        const assignmentId = String(payload.assignmentId || '');
        if (!assignmentId) throw new Error('The assignment reference is missing.');
        const { triggerAssignmentReleaseNotifications } = await import('@/lib/assignments/notifications');
        const result = await triggerAssignmentReleaseNotifications(assignmentId, actor.user.id);
        if (result.status === 'failed') {
          throw new Error(result.error || 'Assignment learner alerts still require recovery.');
        }
      } else {
        const reportId = String(payload.reportId || '');
        if (!reportId) throw new Error('The progress report reference is missing.');
        const { data: report, error: reportError } = await actor.db
          .from('student_progress_reports')
          .select('id,student_id,verification_code,overall_grade,overall_score,course_name,report_term,report_period,school_id,is_published')
          .eq('id', reportId)
          .maybeSingle();
        if (reportError) throw reportError;
        if (!report?.is_published || !report.student_id) throw new Error('The published progress report is no longer available for delivery.');
        const { queueProgressReportPublicationDelivery } = await import('@/lib/reports/publication-delivery');
        const result = await queueProgressReportPublicationDelivery(actor.db as any, report as any, actor.user.id);
        if (result.status === 'delivery_failed' || result.status === 'recovery_required') {
          throw new Error('Progress report delivery still requires recovery.');
        }
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
