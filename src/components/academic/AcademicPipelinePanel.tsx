'use client';

/**
 * Where teaching content stops, as counts.
 *
 * The chain runs curriculum → published edition → school adoption → class course → teaching plan,
 * and every link used to report somewhere different, so a break at any one of them read as
 * "nothing happened" everywhere. Diagnosing a stall meant querying the database directly.
 *
 * Lives on the Academic Office overview rather than a page of its own: a separate screen nobody
 * links to is how the previous monitor ended up as a re-export nobody opened.
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

type BlockedProgramme = {
  programId: string | null;
  programme: string;
  classCount: number;
  courseCount: number;
  publishedCount: number;
  classes: string[];
};

type Coverage = {
  programId: string;
  programme: string;
  courseCount: number;
  publishedCount: number;
  publishedCourses: string[];
};

type Pipeline = {
  steps: Step[];
  blocked: Blocked[];
  blockedByProgramme: BlockedProgramme[];
  coverage: Coverage[];
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

export function AcademicPipelinePanel() {
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

  // The break is the first step with nothing in it; nothing after it can have run.
  const breakIndex = data ? data.steps.findIndex((s) => s.count === 0) : -1;

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-foreground">Where teaching content stops</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `Checked ${when(data.generatedAt)}` : 'Reading the chain…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}

      {data && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {data.steps.map((step, i) => {
              const isBreak = i === breakIndex;
              const dead = breakIndex > -1 && i > breakIndex;
              return (
                <div
                  key={step.key}
                  title={step.detail}
                  className={`rounded-2xl border p-4 ${
                    isBreak
                      ? 'border-rose-500/40 bg-rose-500/10'
                      : dead
                        ? 'border-border bg-muted/20 opacity-60'
                        : 'border-emerald-500/30 bg-emerald-500/5'
                  }`}
                >
                  <p className="text-3xl font-black text-foreground">{step.count}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    {step.label}
                  </p>
                  {isBreak && <p className="mt-2 text-[11px] font-bold text-rose-500">Stops here</p>}
                </div>
              );
            })}
          </div>

          {breakIndex > -1 && (
            <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-foreground">
              {data.steps[breakIndex].detail}
            </p>
          )}

          {/* Which programme each published edition actually serves. "1 published edition" does
              not say whether it reaches the classes that are waiting. */}
          {(data.coverage ?? []).length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Published, by programme
              </p>
              <ul className="mt-2 space-y-1.5">
                {data.coverage.map((row) => (
                  <li key={row.programId} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="font-bold text-foreground">{row.programme}</span>
                    <span
                      className={
                        row.publishedCount > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }
                    >
                      {row.publishedCount} of {row.courseCount} course{row.courseCount === 1 ? '' : 's'}
                      {row.publishedCourses.length ? ` · ${row.publishedCourses.join(', ')}` : ' · nothing published'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.resolving.length > 0 && (
            <details className="mt-4 rounded-xl border border-border bg-background p-3">
              <summary className="cursor-pointer text-sm font-bold text-foreground">
                {data.resolving.length} class{data.resolving.length === 1 ? '' : 'es'} will be set automatically
              </summary>
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                {data.resolving.map((c) => <li key={c.id}>{c.name}</li>)}
              </ul>
            </details>
          )}

          {data.blocked.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-black text-amber-700 dark:text-amber-300">
                <ExclamationTriangleIcon className="h-5 w-5" />
                {data.blocked.length} class{data.blocked.length === 1 ? '' : 'es'} need a decision
              </p>

              {/* Grouped first, because the fix is one act per programme rather than one per class:
                  publish a single course and every class in that programme resolves, since one
                  live edition leaves nothing to choose between. */}
              <ul className="mt-3 space-y-2">
                {(data.blockedByProgramme ?? []).map((group) => (
                  <li
                    key={group.programId ?? 'none'}
                    className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs"
                  >
                    <p className="font-black text-foreground">
                      {group.programme} — {group.classCount} class{group.classCount === 1 ? '' : 'es'} waiting
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {group.courseCount === 0
                        ? 'This programme has no courses, so nothing can be published for it yet.'
                        : group.publishedCount === 0
                          ? `${group.courseCount} course${group.courseCount === 1 ? '' : 's'}, none published. Publishing any one of them clears all ${group.classCount}.`
                          : `${group.publishedCount} of ${group.courseCount} courses published — more than one live edition, so someone must choose.`}
                    </p>
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground">Which classes</summary>
                      <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
                        {group.classes.map((name) => <li key={name}>{name}</li>)}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/academic/rollout"
                className="mt-3 inline-flex rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90"
              >
                Go to rollout
              </Link>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.values(data.jobs).map((job) => (
              <div
                key={job.job_name}
                className={`rounded-xl border p-3 ${
                  job.consecutive_failures > 0 ? 'border-rose-500/40 bg-rose-500/5' : 'border-border bg-background'
                }`}
              >
                <p className="text-xs font-black text-foreground">{JOB_LABEL[job.job_name] ?? job.job_name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Last run {when(job.last_finished_at)} · last success {when(job.last_success_at)}
                </p>
                {job.consecutive_failures > 0 && (
                  <p className="mt-1 text-[11px] font-bold text-rose-500">
                    {job.consecutive_failures} failure{job.consecutive_failures === 1 ? '' : 's'} in a row
                    {job.last_error ? `: ${job.last_error}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
