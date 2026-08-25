'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useOfficeOptional } from './OfficeContext';
import { cronLabel } from '@/lib/operations/cron-registry';
import { cronHealthCode } from '@/lib/operations/health-state';

type HealthRow = {
  job_name: string;
  job_label?: string;
  schedule?: string;
  purpose?: string;
  trigger?: string;
  expected_interval_minutes: number;
  last_finished_at: string | null;
  last_success_at: string | null;
  next_expected_at: string | null;
  last_status_code: number | null;
  last_duration_ms: number | null;
  last_error: string | null;
  consecutive_failures: number;
};
type DeadLetter = {
  id: string;
  source: string;
  job_type: string;
  error: string;
  attempts: number;
  retry_count: number;
  status: string;
  created_at: string;
  can_retry: boolean;
};
type RunRow = {
  id: string;
  job_name: string;
  success: boolean;
  status_code: number | null;
  duration_ms: number;
  error: string | null;
  created_at: string;
};
type FinanceFailure = {
  id: string;
  stream: string;
  action: string;
  entity_id: string | null;
  channel: string | null;
  status: string;
  error: string | null;
  created_at: string;
};
type GenerationIncident = {
  planId: string;
  className: string | null;
  courseTitle: string | null;
  type: string;
  failures: number;
  generatedAt: string | null;
};

/** Finished work sitting behind the approval gate. */
type WaitingRow = {
  key: string;
  label: string;
  detail: string;
  /** null when the count could not be read — shown as unknown, never as zero. */
  count: number | null;
  href: string;
};

/** One row per job the dispatcher tried to start, with what came back. */
type FanoutSummary = {
  children: Array<{ job: string; status: string; host: string; at: string | null }>;
  failing: Array<{ job: string; status: string; host: string; at: string | null }>;
  /** Nothing was reached at all — the dispatcher is broken, not the jobs. */
  allUnreachable: boolean;
};

type TrafficProtection = {
  api_mutation_rate_limit_enabled: boolean;
  api_mutation_requests_per_window: number;
  api_mutation_window_seconds: number;
  sharedStoreConfigured: boolean;
  api_origin_guard_mode: 'off' | 'observe' | 'enforce';
};

type SecurityObservations = {
  available: boolean;
  last24Hours: number;
  latestAt: string | null;
  topDirectives: Array<{ directive: string; count: number }>;
};

// Labels live in the cron registry alongside the schedule, so a new job is named once.
const friendlyJob = cronLabel;

function healthState(row: HealthRow) {
  const code = cronHealthCode(row);
  if (code === 'failing') return { label: 'Failing', cls: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30' };
  if (code === 'never_run') return { label: 'Waiting for first run', cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' };
  if (code === 'late') {
    return { label: 'Late', cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' };
  }
  return { label: 'Healthy', cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
}

function friendlyOperationalName(value: string): string {
  const words = value.replace(/[-_.]+/g, ' ').trim();
  return words ? words.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Automated work';
}

type Props = { embedded?: boolean };

export function OperationsHealthPanel({ embedded = false }: Props) {
  const office = useOfficeOptional();
  const notify = office?.notifyOfficeChange;
  const revision = office?.revision ?? 0;
  const lastChange = office?.lastChange ?? null;
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [history, setHistory] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [financeFailures, setFinanceFailures] = useState<FinanceFailure[]>([]);
  const [generationIncidents, setGenerationIncidents] = useState<GenerationIncident[]>([]);
  const [fanout, setFanout] = useState<FanoutSummary | null>(null);
  const [waiting, setWaiting] = useState<WaitingRow[]>([]);
  const [trafficProtection, setTrafficProtection] = useState<TrafficProtection | null>(null);
  const [securityObservations, setSecurityObservations] = useState<SecurityObservations | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/operations-health', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load operations health.');
      setHealth(json.health ?? []);
      setDeadLetters(json.deadLetters ?? []);
      setHistory(json.history ?? []);
      setFinanceFailures(json.financeFailures ?? []);
      setGenerationIncidents(json.generationIncidents ?? []);
      setFanout(json.fanout ?? null);
      setWaiting(json.waiting ?? []);
      setTrafficProtection(json.trafficProtection ?? null);
      setSecurityObservations(json.securityObservations ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load operations health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!revision) return;
    if (lastChange && !['health', 'settings', 'automation', 'inbox', 'newsletters'].includes(lastChange)) return;
    void load();
  }, [revision, lastChange, load]);

  async function act(payload: Record<string, string>) {
    if (payload.action === 'run_now') {
      const label = friendlyJob(payload.jobName || 'scheduled job');
      if (!window.confirm(`Run ${label} now?\n\nThis performs real scheduled work. Duplicate execution will be blocked automatically.`)) return;
    }
    const key = payload.id || payload.jobName || payload.action;
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/operations-health', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Action failed.');
      setNotice(json.warning || (payload.action === 'run_now' ? 'Scheduled work completed.' : 'Action completed.'));
      await load();
      notify?.('health');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  const totals = useMemo(() => {
    const states = health.map(healthState);
    return {
      healthy: states.filter((s) => s.label === 'Healthy').length,
      attention:
        states.filter((s) => s.label !== 'Healthy').length
        + (fanout?.failing.length ?? 0)
        + financeFailures.length
        + generationIncidents.length,
      dead: deadLetters.length,
      jobs: health.length,
    };
  }, [health, deadLetters, fanout, financeFailures, generationIncidents]);

  return (
    <div className="space-y-6">
      {!embedded ? (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Administration</p>
            <h1 className="text-2xl font-black">Scheduled work</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Check that timed office work is running. Green means you do not need to do anything.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground"
          >
            Refresh
          </button>
        </header>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Green means leave it running. Red or amber needs attention.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 touch-manipulation rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground"
          >
            Refresh
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['Scheduled jobs', totals.jobs],
            ['Working normally', totals.healthy],
            ['Need attention', totals.attention],
            ['Messages needing help', totals.dead],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </div>
        ))}
      </div>

      {trafficProtection ? (
        <section className={`rounded-2xl border p-5 ${
          !trafficProtection.api_mutation_rate_limit_enabled
            ? 'border-amber-500/40 bg-amber-500/5'
            : trafficProtection.sharedStoreConfigured
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/40 bg-amber-500/5'
        }`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-black">API write protection</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {!trafficProtection.api_mutation_rate_limit_enabled
                  ? 'Turned off by an administrator. Normal work remains available.'
                  : trafficProtection.sharedStoreConfigured
                    ? `Shared protection is active: ${trafficProtection.api_mutation_requests_per_window} writes per ${trafficProtection.api_mutation_window_seconds} seconds, per user and feature area.`
                    : 'Protection is active per app instance, but no shared counter is configured. Normal work is not blocked; coordinated abuse protection is weaker across multiple instances.'}
              </p>
              <p className="mt-2 text-xs font-bold text-foreground">
                Browser request checks: {trafficProtection.api_origin_guard_mode === 'enforce'
                  ? 'Enforced'
                  : trafficProtection.api_origin_guard_mode === 'observe'
                    ? 'Observation only — nothing is blocked'
                    : 'Off'}
              </p>
            </div>
            <Link
              href="/dashboard/platform-operations?view=lms"
              className="inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-xl border border-border px-4 py-2 text-sm font-black"
            >
              Change settings
            </Link>
          </div>
        </section>
      ) : null}

      {securityObservations ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-black">Browser security observations</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {!securityObservations.available
                  ? 'Observation storage is awaiting setup. No customer work is blocked.'
                  : securityObservations.last24Hours === 0
                    ? 'No browser policy conflicts were recorded in the last 24 hours. The policy is still observation-only.'
                    : `${securityObservations.last24Hours} policy conflict${securityObservations.last24Hours === 1 ? '' : 's'} were observed in the last 24 hours. Nothing was blocked.`}
              </p>
              {securityObservations.topDirectives.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Most common: {securityObservations.topDirectives
                    .map((row) => `${row.directive.replace(/-/g, ' ')} (${row.count})`)
                    .join(', ')}
                </p>
              ) : null}
            </div>
            {securityObservations.latestAt ? (
              <span className="shrink-0 text-xs font-bold text-muted-foreground">
                Latest {new Date(securityObservations.latestAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/*
        Placed above the machine panels on purpose. Everything below this is the
        system reporting on itself; this is the only part that cannot fix itself,
        because each row is finished work waiting on a person. It stayed
        invisible precisely because nothing here was broken — 82 progress
        reports sat scored and unpublished, the oldest four months old, while
        every panel on this page read green.
      */}
      {waiting.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-500/5">
          <div className="border-b border-amber-500/30 p-5">
            <h2 className="font-black text-amber-200">Waiting on you</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Finished work that no learner or parent can see until it is released. Nothing here is broken.
            </p>
          </div>
          <div className="divide-y divide-amber-500/20">
            {waiting.map((row) => (
              <Link
                key={row.key}
                href={row.href}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-amber-500/10 focus-visible:bg-amber-500/10 focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <p className="font-bold">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.detail}</p>
                </div>
                <span className="shrink-0 text-2xl font-black tabular-nums text-amber-200">
                  {row.count ?? '—'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/*
        Nine jobs are not on the scheduler at all — another job calls them. The
        dispatcher recorded every result and nothing showed it, so when it began
        failing, those jobs simply stopped and the panel stayed green: a job that
        is never invoked never records a failure, it only grows an old
        last_success_at, which reads as quiet rather than broken.
      */}
      {fanout && fanout.failing.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-red-500/40 bg-red-500/5">
          <div className="border-b border-red-500/30 p-5">
            <h2 className="font-black text-red-300">
              {fanout.allUnreachable
                ? 'Jobs are not being started at all'
                : `${fanout.failing.length} job${fanout.failing.length === 1 ? '' : 's'} could not be started`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {fanout.allUnreachable
                ? 'Every one of these failed before the job itself was reached, so none of them ran and none of them recorded an error. This is the dispatcher, not the jobs.'
                : 'These are started by another job rather than by the scheduler.'}
            </p>
          </div>
          <div className="divide-y divide-red-500/20">
            {fanout.failing.map((child) => (
              <div key={`${child.host}-${child.job}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold">{child.job}</p>
                  <p className="text-xs text-muted-foreground">started by {child.host}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs text-red-300">{child.status}</p>
                  {child.at && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(child.at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-black">Automatic scheduled work</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            This checks the real work completed, not only whether the outside timer reached the app.
          </p>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading health...</p>
        ) : (
          <div className="divide-y divide-border">
            {health.map((row) => {
              const state = healthState(row);
              return (
                <div key={row.job_name} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{friendlyJob(row.job_name)}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${state.cls}`}>
                        {state.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.purpose || 'Scheduled operational work'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.schedule || `Every ${row.expected_interval_minutes} minutes`} · Last completed: {row.last_finished_at ? new Date(row.last_finished_at).toLocaleString() : 'not yet'}
                    </p>
                    {row.last_error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">What went wrong: {row.last_error}</p> : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy === row.job_name}
                    onClick={() => void act({ action: 'run_now', jobName: row.job_name })}
                    className="min-h-11 touch-manipulation rounded-xl border border-primary px-4 py-2 text-xs font-black text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {busy === row.job_name ? 'Running' : 'Run now'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-black">Messages needing help</h2>
              <p className="mt-1 text-xs text-muted-foreground">A message that could not be sent stays here. It is never silently lost.</p>
            </div>
            <Link
              href="/dashboard/office?workspace=settings&section=templates"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-border px-4 py-2 text-xs font-black"
            >
              Open templates
            </Link>
          </div>
        </div>
        {deadLetters.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No messages need help.</p>
        ) : (
          <div className="divide-y divide-border">
            {deadLetters.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-bold">
                    {friendlyOperationalName(row.job_type)} <span aria-hidden="true">&middot;</span>{' '}
                    {friendlyOperationalName(row.source)}
                  </p>
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{row.error}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Attempts {row.attempts} | admin retries {row.retry_count} | {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.can_retry ? (
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void act({ action: 'retry', id: row.id })}
                      className="min-h-11 touch-manipulation rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-50"
                    >
                      Try again
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void act({ action: 'resolve', id: row.id })}
                    className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black disabled:opacity-50"
                  >
                    Mark checked
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-black">Generation incidents</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Plans with recorded generation failures by content type. Use Check now above, then
            open the plan to retry the affected week.
          </p>
        </div>
        {generationIncidents.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No generation incidents recorded.</p>
        ) : (
          <div className="divide-y divide-border">
            {generationIncidents.map((row) => (
              <div key={`${row.planId}:${row.type}`} className="p-4">
                <p className="text-sm font-bold">
                  {row.className ?? "Unknown class"} | {row.courseTitle ?? "Unknown course"} |{" "}
                  {row.type}
                </p>
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {row.failures} failure{row.failures === 1 ? "" : "s"} recorded
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.generatedAt ? new Date(row.generatedAt).toLocaleString() : "Unknown time"} |{" "}
                  <a
                    className="underline hover:text-foreground"
                    href={`/dashboard/lesson-plans/${row.planId}`}
                  >
                    Open plan
                  </a>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-black">Finance delivery failures</h2>
          <p className="mt-1 text-xs text-muted-foreground">Failed finance sends are shown separately from accounting-state maintenance.</p>
        </div>
        {financeFailures.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No recent finance delivery failures.</p>
        ) : (
          <div className="divide-y divide-border">
            {financeFailures.map((row) => (
              <div key={row.id} className="p-4">
                <p className="text-sm font-bold">
                  {friendlyOperationalName(row.stream)} <span aria-hidden="true">&middot;</span>{' '}
                  {friendlyOperationalName(row.action)}
                  {row.channel ? ` · ${friendlyOperationalName(row.channel)}` : ''}
                </p>
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{row.error || 'Delivery failed without a provider message.'}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                  {row.status === 'skipped' ? ' · Automatic retry is temporarily paused' : ' · Automatic recovery will retry safely'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-black">Recent execution history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="p-3">Job</th>
                <th className="p-3">Result</th>
                <th className="p-3">Status</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 30).map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-3 font-bold">{row.job_name}</td>
                  <td className={`p-3 font-black ${row.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {row.success ? 'Success' : 'Failed'}
                  </td>
                  <td className="p-3">{row.status_code ?? '-'}</td>
                  <td className="p-3">{row.duration_ms} ms</td>
                  <td className="p-3">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
