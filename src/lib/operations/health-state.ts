import { monitoredCronJobs } from '@/lib/operations/cron-registry';

export type CronHealthRow = {
  job_name: string;
  job_label?: string;
  schedule?: string;
  purpose?: string;
  trigger?: string;
  expected_interval_minutes: number;
  last_started_at?: string | null;
  last_finished_at: string | null;
  last_success_at?: string | null;
  next_expected_at: string | null;
  last_status_code?: number | null;
  last_duration_ms?: number | null;
  last_error?: string | null;
  last_result?: unknown;
  consecutive_failures: number;
  never_run?: boolean;
};

export type CronHealthCode = 'healthy' | 'failing' | 'late' | 'never_run';

/** One health rule shared by Operations Health, the Office Desk, and tests. */
export function cronHealthCode(row: CronHealthRow, now = Date.now()): CronHealthCode {
  if (Number(row.consecutive_failures || 0) > 0) return 'failing';
  if (!row.last_finished_at) return 'never_run';
  const interval = Math.max(1, Number(row.expected_interval_minutes) || 1);
  const graceMs = Math.max(10, Math.ceil(interval * 0.25)) * 60_000;
  const expectedAt = row.next_expected_at ? new Date(row.next_expected_at).getTime() : Number.NaN;
  if (Number.isFinite(expectedAt) && now > expectedAt + graceMs) return 'late';
  return 'healthy';
}

export function cronNeedsAttention(row: CronHealthRow, now = Date.now()): boolean {
  return cronHealthCode(row, now) !== 'healthy';
}

/** Fields the 2× overdue probe needs — full health rows always satisfy this. */
export type CronOverdueInput = {
  job_name: string;
  job_label?: string;
  trigger?: string;
  expected_interval_minutes: number;
  last_success_at?: string | null;
};

/**
 * Machine liveness for uptime monitors: a job is overdue when it has never
 * succeeded, or its last success is older than 2× the registry interval
 * (floored at 15 minutes so 1-minute notification polls are not hair-trigger).
 */
export function cronOverdueBeyond2x(
  row: CronOverdueInput,
  now = Date.now(),
): boolean {
  const interval = Math.max(1, Number(row.expected_interval_minutes) || 1);
  const limitMs = Math.max(15, interval * 2) * 60_000;
  const successAt = row.last_success_at
    ? new Date(row.last_success_at).getTime()
    : Number.NaN;
  if (!Number.isFinite(successAt)) return true;
  return now - successAt > limitMs;
}

export type CronOverdueJob = {
  name: string;
  label?: string;
  trigger?: string;
  intervalMinutes: number;
  last_success_at: string | null;
  ageMinutes: number | null;
};

export function listCronOverdueBeyond2x(
  rows: CronOverdueInput[],
  now = Date.now(),
  opts?: { triggers?: Array<string | undefined> },
): CronOverdueJob[] {
  const allowed = opts?.triggers?.length
    ? new Set(opts.triggers.map(String))
    : null;
  return rows
    .filter((row) => {
      if (allowed && !allowed.has(String(row.trigger ?? ''))) return false;
      return cronOverdueBeyond2x(row, now);
    })
    .map((row) => {
      const successAt = row.last_success_at
        ? new Date(row.last_success_at).getTime()
        : Number.NaN;
      return {
        name: row.job_name,
        label: row.job_label,
        trigger: row.trigger,
        intervalMinutes: Math.max(1, Number(row.expected_interval_minutes) || 1),
        last_success_at: row.last_success_at ?? null,
        ageMinutes: Number.isFinite(successAt)
          ? Math.round((now - successAt) / 60_000)
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * cron_job_health gains a row only after a first run. Add registered jobs that
 * have no row so a missing scheduler entry becomes visible instead of looking healthy.
 */
export function withRegisteredCronJobs(rows: Array<Record<string, unknown>>): CronHealthRow[] {
  const registered = monitoredCronJobs();
  const jobByName = new Map(registered.map((job) => [job.name, job]));
  const enriched = rows.map((row) => {
    const job = jobByName.get(String(row.job_name));
    return {
      ...row,
      job_label: job?.label,
      schedule: job?.schedule,
      purpose: job?.purpose,
      trigger: job?.trigger,
    } as CronHealthRow;
  });
  const seen = new Set(enriched.map((row) => String(row.job_name)));
  const placeholders: CronHealthRow[] = registered
    .filter((job) => !seen.has(job.name))
    .map((job) => ({
      job_name: job.name,
      job_label: job.label,
      schedule: job.schedule,
      purpose: job.purpose,
      trigger: job.trigger,
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

  return [...enriched, ...placeholders]
    .sort((a, b) => a.job_name.localeCompare(b.job_name));
}

export type FinanceAutomationStateRow = {
  id: string;
  stream: string;
  action: string;
  entity_type?: string | null;
  entity_id: string | null;
  stage?: string | null;
  channel: string | null;
  status: string;
  error: string | null;
  attempt?: number | null;
  created_at: string;
};

function financeWorkKey(row: FinanceAutomationStateRow): string {
  return [row.stream, row.entity_id ?? row.id, row.stage ?? '', row.channel ?? ''].join('|');
}

/**
 * A failed attempt is historical once the same finance work later succeeds.
 * Keep only the latest state for each stream/entity/stage/channel and surface
 * retry-limit skips because they represent paused work, not a successful skip.
 */
export function currentFinanceIncidents(rows: FinanceAutomationStateRow[]): FinanceAutomationStateRow[] {
  const latest = new Map<string, FinanceAutomationStateRow>();
  for (const row of [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const key = financeWorkKey(row);
    if (!latest.has(key)) latest.set(key, row);
  }

  return [...latest.values()]
    .filter((row) => {
      const status = String(row.status || '').toLowerCase();
      return status === 'failed' || (status === 'skipped' && /retry[_ -]?limit/i.test(row.error || ''));
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export type FanoutChildState = { job: string; status: string; host: string; at: string | null };

export function summariseFanoutState(rows: Array<Record<string, unknown>>) {
  const children: FanoutChildState[] = [];
  for (const row of rows) {
    let parsed: { host?: string; at?: string; result?: Record<string, string> } | null = null;
    try {
      parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value as typeof parsed;
    } catch {
      continue;
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
  const failing = children.filter((child) => child.status !== 'ok');
  return {
    children,
    failing,
    allUnreachable: children.length > 0 && children.every((child) => child.status.startsWith('unreachable')),
  };
}

export type GenerationIncident = {
  planId: string;
  className: string | null;
  courseTitle: string | null;
  type: string;
  failures: number;
  generatedAt: string | null;
};

export function generationIncidentsFromPlans(rows: any[]): GenerationIncident[] {
  return rows.flatMap((row) => {
    const errors = row?.metadata?.last_generation_errors;
    if (!errors || typeof errors !== 'object') return [];
    const generatedAt = typeof errors.generated_at === 'string' ? errors.generated_at : null;
    return ['lessons', 'slides', 'flashcards', 'assignments', 'projects']
      .filter((key) => Array.isArray((errors as Record<string, unknown>)[key]) && ((errors as Record<string, unknown>)[key] as unknown[]).length > 0)
      .map((key) => ({
        planId: String(row.id),
        className: row?.classes?.name ?? null,
        courseTitle: row?.courses?.title ?? null,
        type: key,
        failures: ((errors as Record<string, unknown>)[key] as unknown[]).length,
        generatedAt,
      }));
  });
}
