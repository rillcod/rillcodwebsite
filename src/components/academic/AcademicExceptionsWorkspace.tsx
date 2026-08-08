'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon,
  TrashIcon, UserGroupIcon,
} from '@/lib/icons';
import type { StudentExceptionKind, StudentExceptionQueues, StudentExceptionRow } from '@/lib/accountability/student-exceptions';

const CARD = 'rounded-2xl border border-border bg-card';
const LABEL = 'text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground';

const QUEUE_META: Record<StudentExceptionKind, { label: string; hint: string; tone: string }> = {
  displaced: {
    label: 'Not in a class',
    hint: 'Still enrolled, but not on this term’s class list',
    tone: 'text-amber-600 dark:text-amber-400',
  },
  hollow_shell: {
    label: 'Empty old accounts',
    hint: 'Old unused accounts with no real school records — safe to remove',
    tone: 'text-rose-600 dark:text-rose-400',
  },
  placeholder_noise: {
    label: 'Test / junk accounts',
    hint: 'Fake or empty profiles with no parent, class, or reports',
    tone: 'text-orange-600 dark:text-orange-400',
  },
  withdrawn_active: {
    label: 'Left but still logged in',
    hint: 'Marked as left / ended, but their login is still on',
    tone: 'text-violet-600 dark:text-violet-400',
  },
  class_mismatch: {
    label: 'Wrong class',
    hint: 'Their account class doesn’t match this term’s class list',
    tone: 'text-sky-600 dark:text-sky-400',
  },
  missing_parent_contact: {
    label: 'No parent contact',
    hint: 'No parent email or phone — add details before messaging',
    tone: 'text-indigo-600 dark:text-indigo-400',
  },
};

const ACTION_LABEL: Record<StudentExceptionRow['recommended_action'], string> = {
  purge: 'Safe to delete',
  assign_roster: 'Put them in a class',
  link_parent: 'Add parent details',
  sync_class: 'Fix to match class list',
  deactivate: 'Turn off their login',
  review: 'Needs a person to check',
};

type DryRunResult = {
  note?: string;
  completedPayments?: number;
  account?: { email?: string; role?: string };
};

type Props = {
  classId?: string;
};

function shouldStartExpanded() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'academic-exceptions') return true;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get('queue'));
}

function queueFromUrl(): StudentExceptionKind | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const q = params.get('queue');
  if (q && q in QUEUE_META) return q as StudentExceptionKind;
  return null;
}

export default function AcademicExceptionsWorkspace({ classId = '' }: Props) {
  const [data, setData] = useState<StudentExceptionQueues | null>(null);
  const [automation, setAutomation] = useState<Record<string, unknown> | null>(null);
  const [hollowScan, setHollowScan] = useState<{ min_age_days: number; matched: number } | null>(null);
  const [classFilter, setClassFilter] = useState<{ class_id: string; class_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<StudentExceptionKind>(() => queueFromUrl() || 'displaced');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dryRuns, setDryRuns] = useState<Record<string, DryRunResult>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    if (shouldStartExpanded()) setExpanded(true);
    const fromUrl = queueFromUrl();
    if (fromUrl) setQueue(fromUrl);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ hollow_min_age_days: '90' });
      if (classId) params.set('class_id', classId);
      const res = await fetch(`/api/admin/accountability/exceptions?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load exceptions');
      setData(json.exceptions);
      setAutomation(json.automation ?? null);
      setHollowScan(json.hollow_scan ?? null);
      setClassFilter(json.class_filter ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load exceptions');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.queues[queue] ?? [];
  }, [data, queue]);

  const runDryRun = async (row: StudentExceptionRow, action: 'purge' | 'safe-delete' = 'purge') => {
    setBusyId(row.id);
    setFeedback((f) => ({ ...f, [row.id]: '' }));
    try {
      const res = await fetch('/api/admin/manage-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, portalUserId: row.id, dryRun: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Dry-run failed');
      setDryRuns((d) => ({ ...d, [row.id]: { ...json, _action: action } as DryRunResult }));
      setFeedback((f) => ({
        ...f,
        [row.id]: action === 'safe-delete'
          ? 'Dry-run complete — review below before deactivating.'
          : 'Dry-run complete — review below before hard purge.',
      }));
    } catch (e) {
      setFeedback((f) => ({ ...f, [row.id]: `Error: ${e instanceof Error ? e.message : 'Dry-run failed'}` }));
    } finally {
      setBusyId(null);
    }
  };

  const hardPurge = async (row: StudentExceptionRow) => {
    const label = row.full_name || row.email || row.id;
    if (!window.confirm(
      `PERMANENTLY delete "${label}"?\n\nThis hard-purges the student login and all related rows. This cannot be undone.`,
    )) return;

    setBusyId(row.id);
    setFeedback((f) => ({ ...f, [row.id]: '' }));
    try {
      const res = await fetch('/api/admin/manage-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purge', portalUserId: row.id, dryRun: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Purge failed');
      setFeedback((f) => ({
        ...f,
        [row.id]: json.partial
          ? `Hard purge partially completed; ${json.failedTargets?.length ?? 0} item(s) still need attention.`
          : 'Hard purge completed.',
      }));
      await fetch('/api/admin/accountability', { method: 'POST' });
      await load();
    } catch (e) {
      setFeedback((f) => ({ ...f, [row.id]: `Error: ${e instanceof Error ? e.message : 'Purge failed'}` }));
    } finally {
      setBusyId(null);
    }
  };

  const deactivateAccount = async (row: StudentExceptionRow) => {
    const label = row.full_name || row.email || row.id;
    if (!window.confirm(
      `Deactivate "${label}"?\n\nThis removes the login (safe-delete) while preserving payment history. Confirm only after dry-run.`,
    )) return;

    setBusyId(row.id);
    setFeedback((f) => ({ ...f, [row.id]: '' }));
    try {
      const res = await fetch('/api/admin/manage-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'safe-delete', portalUserId: row.id, dryRun: false, force: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Deactivate failed');
      setFeedback((f) => ({
        ...f,
        [row.id]: json.partial
          ? `Account deactivated, but ${json.failedTargets?.length ?? 0} cleanup item(s) still need attention.`
          : 'Account deactivated (safe-delete).',
      }));
      await fetch('/api/admin/accountability', { method: 'POST' });
      await load();
    } catch (e) {
      setFeedback((f) => ({ ...f, [row.id]: `Error: ${e instanceof Error ? e.message : 'Deactivate failed'}` }));
    } finally {
      setBusyId(null);
    }
  };

  const syncClass = async (row: StudentExceptionRow) => {
    setSyncingId(row.id);
    setFeedback((f) => ({ ...f, [row.id]: '' }));
    try {
      const res = await fetch('/api/admin/accountability/sync-classes', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      if (json.partial) {
        setFeedback((f) => ({
          ...f,
          [row.id]: `Class sync updated ${json.synced_count ?? 0} profile(s), but ${json.failed_count ?? 0} item(s) still need attention.`,
        }));
        await fetch('/api/admin/accountability', { method: 'POST' });
        await load();
        return;
      }
      setFeedback((f) => ({
        ...f,
        [row.id]: `Class sync ran (${json.synced_count ?? 0} profile(s) updated). Refreshing…`,
      }));
      await fetch('/api/admin/accountability', { method: 'POST' });
      await load();
    } catch (e) {
      setFeedback((f) => ({ ...f, [row.id]: `Error: ${e instanceof Error ? e.message : 'Sync failed'}` }));
    } finally {
      setSyncingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className={`${CARD} p-8 text-center text-sm text-muted-foreground`}>
        <ArrowPathIcon className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
        Loading student exception queues…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`${CARD} border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-600 dark:text-rose-400`}>
        {error}
        <button type="button" onClick={() => void load()} className="ml-3 font-bold underline">Retry</button>
      </div>
    );
  }

  const totals = data?.totals;

  return (
    <section id="academic-exceptions" className="space-y-4 scroll-mt-24">
      <div className={`${CARD} overflow-hidden`}>
        <div className="border-b border-border bg-gradient-to-r from-rose-500/10 via-card to-amber-500/5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className={LABEL}>Exception workspace</p>
              <h2 className="mt-1 text-xl sm:text-2xl font-black text-foreground">
                Students that need a human decision
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Not another dashboard — this is the central engine surfacing displaced learners,
                hollow shells, and placeholder noise. Dry-run first, then hard purge only when the
                automation preview says it is safe.
              </p>
              {classFilter && (
                <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                  Filtered to class: {classFilter.class_name}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="rounded-xl bg-foreground px-4 py-2 text-xs font-black uppercase tracking-wider text-background"
              >
                {expanded ? 'Hide cases' : 'Review cases'}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-60"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-border bg-background px-2.5 py-1 font-bold text-muted-foreground">
              Rules {data?.rules_version || String((automation as { rules_version?: string } | null)?.rules_version || '—')}
            </span>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-600 dark:text-emerald-400">
              Observable dry-run → hard purge
            </span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 font-bold text-muted-foreground">
              {data?.all?.length ?? 0} flagged accounts
            </span>
            {data?.generated_at && (
              <span className="rounded-full border border-border bg-background px-2.5 py-1 font-bold text-muted-foreground">
                Scanned {new Date(data.generated_at).toLocaleString()}
              </span>
            )}
            {hollowScan && (
              <span className="rounded-full border border-border bg-background px-2.5 py-1 font-bold text-muted-foreground">
                Hollow scan: {hollowScan.matched} matched · {hollowScan.min_age_days}d min age
              </span>
            )}
          </div>
        </div>

        {expanded && (
          <>
        <div className="flex flex-wrap gap-1 border-b border-border p-2 bg-muted/20">
          {(Object.keys(QUEUE_META) as StudentExceptionKind[]).map((key) => {
            const count = totals?.[key] ?? 0;
            const meta = QUEUE_META[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setQueue(key)}
                className={`rounded-xl px-3 py-2 text-left transition-all ${queue === key ? 'bg-card shadow-sm border border-border' : 'hover:bg-card/60'}`}
              >
                <div className={`text-xs font-black ${queue === key ? meta.tone : 'text-foreground'}`}>
                  {meta.label} ({count})
                </div>
                <div className="text-[10px] text-muted-foreground hidden sm:block max-w-[12rem]">{meta.hint}</div>
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-6 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircleIcon className="w-6 h-6 mx-auto mb-2" />
              No students in the <strong>{QUEUE_META[queue].label}</strong> queue
              {classFilter ? ` for ${classFilter.class_name}` : ''}.
            </div>
          ) : (
            rows.map((row) => {
              const dry = dryRuns[row.id];
              const fb = feedback[row.id];
              const isBusy = busyId === row.id || syncingId === row.id;
              return (
                <article
                  key={`${queue}-${row.id}`}
                  className="rounded-xl border border-border bg-background p-4 space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-foreground">{row.full_name || '(no name)'}</h3>
                        {!row.is_active && (
                          <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Inactive</span>
                        )}
                        {row.purge_eligible && (
                          <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                            Purge candidate
                          </span>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {ACTION_LABEL[row.recommended_action]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{row.email || '—'} · {row.school_name || 'No school'}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-md bg-muted px-2 py-0.5">
                          Roster: {row.class_from_roster || <span className="text-rose-600 dark:text-rose-400 font-bold">not placed</span>}
                        </span>
                        {row.class_on_profile && (
                          <span className="rounded-md bg-muted px-2 py-0.5">Profile: {row.class_on_profile}</span>
                        )}
                        <span className="rounded-md bg-muted px-2 py-0.5">
                          Reports: {row.reports_published} pub · {row.reports_draft} draft
                        </span>
                        <span className="rounded-md bg-muted px-2 py-0.5">
                          Parent: {row.has_parent_email || row.has_parent_contact ? 'linked' : 'missing'}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-0.5">
                        {row.reasons.map((r) => (
                          <li key={r} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      {(queue === 'displaced' || row.recommended_action === 'assign_roster') && (
                        <Link
                          href={`/dashboard/classes/heal?tab=roster&student=${encodeURIComponent(row.id)}`}
                          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300"
                        >
                          Assign roster
                        </Link>
                      )}
                      {(queue === 'missing_parent_contact' || row.recommended_action === 'link_parent') && (
                        <Link
                          href={`/dashboard/parents/add?student_id=${encodeURIComponent(row.id)}`}
                          className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400"
                        >
                          Link parent
                        </Link>
                      )}
                      {(queue === 'class_mismatch' || row.recommended_action === 'sync_class') && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void syncClass(row)}
                          className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 disabled:opacity-50"
                        >
                          {syncingId === row.id ? 'Syncing…' : 'Sync class'}
                        </button>
                      )}
                      {(queue === 'withdrawn_active' || row.recommended_action === 'deactivate') && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runDryRun(row, 'safe-delete')}
                            className="rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-50"
                          >
                            Dry-run deactivate
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !dry}
                            onClick={() => void deactivateAccount(row)}
                            className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-violet-700 dark:text-violet-300 disabled:opacity-40"
                          >
                            Deactivate login
                          </button>
                        </>
                      )}
                      {(row.purge_eligible || queue === 'hollow_shell' || queue === 'placeholder_noise') && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runDryRun(row, 'purge')}
                            className="rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-50"
                          >
                            {isBusy ? '…' : 'Dry-run purge'}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || !dry}
                            onClick={() => void hardPurge(row)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider hover:bg-rose-700 disabled:opacity-40"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                            Hard purge
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {dry && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <p className="font-bold text-foreground mb-1">Automation preview (dry-run)</p>
                      <p>{dry.note}</p>
                      {typeof dry.completedPayments === 'number' && dry.completedPayments > 0 && (
                        <p className="text-rose-600 dark:text-rose-400 font-bold mt-1">
                          {dry.completedPayments} completed payment(s) — do not purge without finance review.
                        </p>
                      )}
                    </div>
                  )}
                  {fb && (
                    <p className={`text-xs font-bold ${fb.startsWith('Error') ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{fb}</p>
                  )}
                </article>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserGroupIcon className="w-3.5 h-3.5" />
            Displaced = assign roster · Hollow/noise = dry-run then hard purge · Withdrawn = deactivate
          </span>
          <Link href="/dashboard/classes/heal?tab=cleanup" className="font-bold text-primary hover:underline">
            Full platform sanitation →
          </Link>
        </div>
          </>
        )}
      </div>
    </section>
  );
}
