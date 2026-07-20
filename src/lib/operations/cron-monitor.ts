import { createAdminClient } from '@/lib/supabase/admin';

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
}) {
  try {
    const db = createAdminClient() as any;
    const { data: previous } = await db.from('cron_job_health')
      .select('consecutive_failures,last_success_at,last_alerted_at')
      .eq('job_name', input.jobName)
      .maybeSingle();
    const failures = input.success ? 0 : Number(previous?.consecutive_failures || 0) + 1;
    const result = safeResult(input.result);
    const durationMs = Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime());
    const nextExpectedAt = new Date(input.finishedAt.getTime() + input.expectedIntervalMinutes * 60000).toISOString();

    await db.from('cron_run_history').insert({
      job_name: input.jobName,
      started_at: input.startedAt.toISOString(),
      finished_at: input.finishedAt.toISOString(),
      duration_ms: durationMs,
      success: input.success,
      status_code: input.statusCode,
      error: input.error ?? null,
      result,
    });

    await db.from('cron_job_health').upsert({
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

    const lastAlerted = previous?.last_alerted_at ? new Date(previous.last_alerted_at).getTime() : 0;
    if (!input.success && failures >= 2 && Date.now() - lastAlerted > 3600000) {
      const { data: admins } = await db.from('portal_users').select('id').eq('role', 'admin').eq('is_active', true);
      if (admins?.length) {
        const now = new Date().toISOString();
        await db.from('notifications').insert(admins.map((admin: { id: string }) => ({
          user_id: admin.id,
          title: `Cron job needs attention: ${input.jobName}`,
          message: `${failures} consecutive failures. ${input.error || `HTTP ${input.statusCode}`}`.slice(0, 500),
          type: 'warning',
          action_url: '/dashboard/admin/operations-health',
          is_read: false,
          created_at: now,
          updated_at: now,
        })));
        await db.from('cron_job_health').update({ last_alerted_at: now }).eq('job_name', input.jobName);
      }
    }
  } catch (monitorError) {
    console.error(`[cron-monitor] unable to record ${input.jobName}:`, monitorError);
  }
}

export async function runMonitoredCron<T extends Response>(
  jobName: string,
  expectedIntervalMinutes: number,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  try {
    const response = await run();
    if (response.status === 401 || response.status === 403) return response;
    const result = await response.clone().json().catch(() => ({}));
    const success = cronResultSucceeded(response.status, result);
    await recordOutcome({
      jobName,
      expectedIntervalMinutes,
      startedAt,
      finishedAt: new Date(),
      success,
      statusCode: response.status,
      error: success ? null : String((result as any)?.error || `HTTP ${response.status}`),
      result,
    });
    return response;
  } catch (error) {
    await recordOutcome({
      jobName,
      expectedIntervalMinutes,
      startedAt,
      finishedAt: new Date(),
      success: false,
      statusCode: 500,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
