import { createAdminClient } from '@/lib/supabase/admin';

const CRON_LEASE_SECONDS = 10 * 60;

function safeResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= 12000) return value as Record<string, unknown>;
    return { truncated: true, preview: encoded.slice(0, 12000) };
  } catch {
    return { unreadable: true };
  }
}

export function cronResultSucceeded(status: number, result: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return true;
  const payload = result as Record<string, unknown>;
  if (payload.success === false || payload.ok === false) return false;
  if (typeof payload.failed === 'number' && payload.failed > 0) return false;
  if (typeof payload.errors === 'number' && payload.errors > 0) return false;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) return false;
  return true;
}

async function recordOutcome(input: {
  jobName: string;
  expectedIntervalMinutes: number;
  startedAt: Date;
  finishedAt: Date;
  success: boolean;
  statusCode: number;
  error?: string | null;
  result?: unknown;
}): Promise<boolean> {
  try {
    const db = createAdminClient() as any;
    const { data: previous, error: previousError } = await db.from('cron_job_health')
      .select('consecutive_failures,last_success_at,last_alerted_at')
      .eq('job_name', input.jobName)
      .maybeSingle();
    if (previousError) throw new Error(`health read failed: ${previousError.message}`);
    const failures = input.success ? 0 : Number(previous?.consecutive_failures || 0) + 1;
    const result = safeResult(input.result);
    const durationMs = Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime());
    const nextExpectedAt = new Date(input.finishedAt.getTime() + input.expectedIntervalMinutes * 60000).toISOString();

    const { error: historyError } = await db.from('cron_run_history').insert({
      job_name: input.jobName,
      started_at: input.startedAt.toISOString(),
      finished_at: input.finishedAt.toISOString(),
      duration_ms: durationMs,
      success: input.success,
      status_code: input.statusCode,
      error: input.error ?? null,
      result,
    });
    if (historyError) throw new Error(`run history write failed: ${historyError.message}`);

    const { error: healthError } = await db.from('cron_job_health').upsert({
      job_name: input.jobName,
      expected_interval_minutes: input.expectedIntervalMinutes,
      last_started_at: input.startedAt.toISOString(),
      last_finished_at: input.finishedAt.toISOString(),
      last_success_at: input.success ? input.finishedAt.toISOString() : previous?.last_success_at ?? null,
      next_expected_at: nextExpectedAt,
      last_status_code: input.statusCode,
      last_duration_ms: durationMs,
      last_error: input.success ? null : input.error || `HTTP ${input.statusCode}`,
      last_result: result,
      consecutive_failures: failures,
      updated_at: input.finishedAt.toISOString(),
    }, { onConflict: 'job_name' });
    if (healthError) throw new Error(`health write failed: ${healthError.message}`);

    const lastAlerted = previous?.last_alerted_at ? new Date(previous.last_alerted_at).getTime() : 0;
    if (!input.success && failures >= 2 && Date.now() - lastAlerted > 3600000) {
      const { data: admins } = await db.from('portal_users').select('id').eq('role', 'admin').eq('is_active', true);
      if (admins?.length) {
        const now = new Date().toISOString();
        const { error: notificationError } = await db.from('notifications').insert(admins.map((admin: { id: string }) => ({
          user_id: admin.id,
          title: `Cron job needs attention: ${input.jobName}`,
          message: `${failures} consecutive failures. ${input.error || `HTTP ${input.statusCode}`}`.slice(0, 500),
          type: 'warning',
          action_url: '/dashboard/office?workspace=settings&section=health',
          is_read: false,
          created_at: now,
          updated_at: now,
        })));
        if (notificationError) {
          console.error(`[cron-monitor] could not alert administrators for ${input.jobName}:`, notificationError);
        } else {
          const { error: alertStateError } = await db.from('cron_job_health')
            .update({ last_alerted_at: now })
            .eq('job_name', input.jobName);
          if (alertStateError) console.error(`[cron-monitor] could not record alert time for ${input.jobName}:`, alertStateError);
        }
      }
    }
    return true;
  } catch (monitorError) {
    console.error(`[cron-monitor] unable to record ${input.jobName}:`, monitorError);
    return false;
  }
}

async function recordOverlap(jobName: string, startedAt: Date): Promise<void> {
  try {
    const db = createAdminClient() as any;
    const finishedAt = new Date();
    const { error } = await db.from('cron_run_history').insert({
      job_name: jobName,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      success: true,
      status_code: 202,
      error: null,
      result: { skipped: true, reason: 'already_running' },
    });
    if (error) throw error;
  } catch (error) {
    console.error(`[cron-monitor] unable to record overlapping ${jobName} request:`, error);
  }
}

async function acquireLease(jobName: string, runId: string): Promise<'acquired' | 'busy' | 'unavailable'> {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db.rpc('claim_cron_job_run', {
      p_job_name: jobName,
      p_run_id: runId,
      p_lease_seconds: CRON_LEASE_SECONDS,
    });
    if (error) {
      // Migration 112 can be deployed independently of the app. Keep scheduled
      // work available during that window, but make the missing guard visible.
      console.error(`[cron-monitor] overlap protection unavailable for ${jobName}:`, error);
      return 'unavailable';
    }
    return data === true ? 'acquired' : 'busy';
  } catch (error) {
    console.error(`[cron-monitor] overlap protection unavailable for ${jobName}:`, error);
    return 'unavailable';
  }
}

async function releaseLease(jobName: string, runId: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    const { error } = await db.rpc('release_cron_job_run', {
      p_job_name: jobName,
      p_run_id: runId,
    });
    if (error) throw error;
  } catch (error) {
    // The lease expires automatically. A release failure delays this job; it
    // cannot create a duplicate run or permanently lock the scheduler.
    console.error(`[cron-monitor] unable to release ${jobName} lease:`, error);
  }
}

function withMonitoringWarning<T extends Response>(response: T): T {
  const headers = new Headers(response.headers);
  headers.set('x-rillcod-monitoring', 'unavailable');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  }) as T;
}

/**
 * A failed run is reported inward, not outward.
 *
 * External schedulers disable a job that keeps answering 5xx. cron-job.org did
 * exactly that to process-notifications: four runs failed inside twelve minutes
 * on 7 Aug — all "fetch failed", an outbound WhatsApp/email call timing out —
 * the endpoint answered 500 each time, and the schedule was switched off. The
 * job then ran twice in the next 37 hours, only when another job's fan-out
 * happened to reach it, against a queue that is meant to drain every minute.
 *
 * Nothing was wrong with the job. A transient upstream timeout had turned into a
 * permanently disabled schedule, and it needed a person to notice and re-enable
 * it — which is the failure mode this whole monitor exists to remove.
 *
 * So the HTTP status now answers the question the scheduler is actually asking:
 * "were you reached, and did you handle it?" — not "did every downstream call
 * succeed?". The second question is answered where it belongs, and already was:
 * cron_run_history.success, cron_job_health.consecutive_failures, and an admin
 * notification once a job fails twice in a row.
 *
 * 401 and 403 still pass through untouched. A bad or missing CRON_SECRET is a
 * misconfiguration, not a transient fault, and a scheduler that keeps calling an
 * endpoint it can never authenticate against SHOULD go red.
 */
function handledButFailed<T extends Response>(jobName: string, body: Record<string, unknown>): T {
  return new Response(JSON.stringify({ ...body, ok: false, job: jobName, handled: true }), {
    // 200 on purpose — see above. The failure is recorded, alerted on, and shown
    // in the health workspace; it must not cost us the schedule as well.
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as T;
}

export async function runMonitoredCron<T extends Response>(
  jobName: string,
  expectedIntervalMinutes: number,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  const runId = crypto.randomUUID();
  const lease = await acquireLease(jobName, runId);
  if (lease === 'busy') {
    await recordOverlap(jobName, startedAt);
    return new Response(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'already_running',
      job: jobName,
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }) as T;
  }
  try {
    const response = await run();
    if (response.status === 401 || response.status === 403) return response;
    const result = await response.clone().json().catch(() => ({}));
    const success = cronResultSucceeded(response.status, result);
    const monitoringAvailable = await recordOutcome({
      jobName,
      expectedIntervalMinutes,
      startedAt,
      finishedAt: new Date(),
      success,
      // The status the handler produced is what gets recorded, so the history
      // keeps the real story even though the caller is answered 200.
      statusCode: response.status,
      error: success ? null : String((result as any)?.error || `HTTP ${response.status}`),
      result,
    });
    if (response.status >= 500) {
      const failed = handledButFailed<T>(jobName, { ...(result as object), upstream_status: response.status });
      return monitoringAvailable ? failed : withMonitoringWarning(failed);
    }
    return monitoringAvailable ? response : withMonitoringWarning(response);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[cron-monitor] ${jobName} exception:`, errorMsg);
    const monitoringAvailable = await recordOutcome({
      jobName,
      expectedIntervalMinutes,
      startedAt,
      finishedAt: new Date(),
      success: false,
      statusCode: 500,
      error: errorMsg,
    });
    const failed = handledButFailed<T>(jobName, { error: errorMsg, upstream_status: 500 });
    return monitoringAvailable ? failed : withMonitoringWarning(failed);
  } finally {
    if (lease === 'acquired') await releaseLease(jobName, runId);
  }
}
