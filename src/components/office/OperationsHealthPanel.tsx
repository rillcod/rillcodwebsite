'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOfficeOptional } from './OfficeContext';
import { cronLabel } from '@/lib/operations/cron-registry';

type HealthRow = {
  job_name: string;
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
  user_id: string | null;
  error: string;
  attempts: number;
  retry_count: number;
  status: string;
  created_at: string;
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

// Labels live in the cron registry alongside the schedule, so a new job is named once.
const friendlyJob = cronLabel;

function healthState(row: HealthRow) {
  if (row.consecutive_failures > 0) return { label: 'Failing', cls: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30' };
  if (!row.last_finished_at) return { label: 'Waiting for first run', cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' };
  const grace = Math.max(10, Math.ceil(row.expected_interval_minutes * 0.25)) * 60000;
  if (row.next_expected_at && Date.now() > new Date(row.next_expected_at).getTime() + grace) {
    return { label: 'Late', cls: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' };
  }
  return { label: 'Healthy', cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
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
  const [error, setError] = useState('');

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
    const key = payload.id || payload.jobName || payload.action;
    setBusy(key);
    setError('');
    try {
      const response = await fetch('/api/admin/operations-health', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Action failed.');
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
      attention: states.filter((s) => s.label !== 'Healthy').length,
      dead: deadLetters.length,
      jobs: health.length,
    };
  }, [health, deadLetters]);

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
                      Last checked: {row.last_finished_at ? new Date(row.last_finished_at).toLocaleString() : 'not yet'} |
                      checks every {row.expected_interval_minutes} minutes
                    </p>
                    {row.last_error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">What went wrong: {row.last_error}</p> : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy === row.job_name}
                    onClick={() => void act({ action: 'run_now', jobName: row.job_name })}
                    className="min-h-11 touch-manipulation rounded-xl border border-primary px-4 py-2 text-xs font-black text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {busy === row.job_name ? 'Checking' : 'Check now'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-black">Messages needing help</h2>
          <p className="mt-1 text-xs text-muted-foreground">A message that could not be sent stays here. It is never silently lost.</p>
        </div>
        {deadLetters.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No messages need help.</p>
        ) : (
          <div className="divide-y divide-border">
            {deadLetters.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-bold">
                    {row.job_type} | {row.source}
                  </p>
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{row.error}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Attempts {row.attempts} | admin retries {row.retry_count} | {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === row.id}
                    onClick={() => void act({ action: 'retry', id: row.id })}
                    className="min-h-11 touch-manipulation rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-50"
                  >
                    Try again
                  </button>
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
                  {row.stream} | {row.action}
                  {row.channel ? ` | ${row.channel}` : ''}
                </p>
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{row.error || 'Delivery failed without a provider message.'}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                  {row.entity_id ? ` | ${row.entity_id}` : ''}
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
