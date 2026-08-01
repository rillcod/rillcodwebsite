'use client';

/**
 * Academic monitor — where teaching content stops.
 *
 * This page used to re-export the Academic Office overview, which describes what the office does
 * rather than what it has produced. The chain that matters runs curriculum → published edition →
 * school adoption → class course → teaching plan, and every link reported somewhere different, so
 * a break anywhere read as "nothing happened" everywhere.
 *
 * Counts only. The first zero is the break, and the classes holding it up are named.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@/lib/icons';

type Step = { key: string; label: string; count: number; detail: string };
type Blocked = { id: string; name: string; reason: string };
type Job = {
  job_name: string;
  last_finished_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
};

type Pipeline = {
  steps: Step[];
  blocked: Blocked[];
  resolving: Array<{ id: string; name: string; via: string }>;
  jobs: Record<string, Job>;
  generatedAt: string;
};

const JOB_LABEL: Record<string, string> = {
  'academic-readiness': 'Prepare class teaching plans',
  'auto-generate-content': 'Generate weekly content',
};

function when(value: string | null): string {
  if (!value) return 'never';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return 'never';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))} min ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export default function AcademicMonitorPage() {
  const [data, setData] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/academic/pipeline', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read the pipeline.');
      setData(json);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read the pipeline.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The break is the first step with nothing in it; everything after it cannot possibly run.
  const breakIndex = data ? data.steps.findIndex((s) => s.count === 0) : -1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Academic monitor</h1>
            <p className="text-sm text-muted-foreground">
              {data ? `Checked ${when(data.generatedAt)}` : 'Reading the chain…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {error && (
          <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">{error}</p>
        )}

        {data && (
          <>
            <section className="grid gap-3 sm:grid-cols-5">
              {data.steps.map((step, i) => {
                const isBreak = i === breakIndex;
                const dead = breakIndex > -1 && i > breakIndex;
                return (
                  <div
                    key={step.key}
                    className={`rounded-2xl border p-4 ${
                      isBreak
                        ? 'border-rose-500/40 bg-rose-500/10'
                        : dead
                          ? 'border-border bg-muted/20 opacity-60'
                          : 'border-emerald-500/30 bg-emerald-500/5'
                    }`}
                  >
                    <p className="text-3xl font-black">{step.count}</p>
                    <p className="mt-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
                      {step.label}
                    </p>
                    {isBreak && (
                      <p className="mt-2 text-[11px] font-bold text-rose-500">Stops here</p>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="space-y-2">
              {data.steps.map((step, i) => (
                <div
                  key={step.key}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    i === breakIndex ? 'border-rose-500/40 bg-rose-500/5' : 'border-border bg-card'
                  }`}
                >
                  <span className="font-black">{step.count}</span>{' '}
                  <span className="font-bold">{step.label.toLowerCase()}</span>
                  <span className="text-muted-foreground"> — {step.detail}</span>
                </div>
              ))}
            </section>

            {data.resolving.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-black">
                  {data.resolving.length} class{data.resolving.length === 1 ? '' : 'es'} will be set automatically
                </p>
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {data.resolving.map((c) => <li key={c.id}>{c.name}</li>)}
                </ul>
              </section>
            )}

            {data.blocked.length > 0 && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-amber-700 dark:text-amber-300">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                  {data.blocked.length} class{data.blocked.length === 1 ? '' : 'es'} need a person
                </p>
                <ul className="mt-3 space-y-2">
                  {data.blocked.map((c) => (
                    <li key={c.id} className="rounded-xl border border-border bg-card px-3 py-2 text-xs">
                      <p className="font-bold text-foreground">{c.name}</p>
                      <p className="mt-0.5 text-muted-foreground">{c.reason}</p>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/dashboard/academic/rollout"
                  className="mt-3 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90"
                >
                  Go to rollout
                </Link>
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2">
              {Object.values(data.jobs).map((job) => (
                <div
                  key={job.job_name}
                  className={`rounded-2xl border p-4 ${
                    job.consecutive_failures > 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-border bg-card'
                  }`}
                >
                  <p className="text-sm font-black">{JOB_LABEL[job.job_name] ?? job.job_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last run {when(job.last_finished_at)} · last success {when(job.last_success_at)}
                  </p>
                  {job.consecutive_failures > 0 && (
                    <p className="mt-2 text-xs font-bold text-rose-500">
                      {job.consecutive_failures} failure{job.consecutive_failures === 1 ? '' : 's'} in a row
                      {job.last_error ? `: ${job.last_error}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
