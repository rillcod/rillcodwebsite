'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrashIcon,
  ArrowPathIcon,
  EyeIcon,
  CheckCircleIcon,
  UserGroupIcon,
  DocumentTextIcon,
  UserIcon,
  ShieldCheckIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface DebrisItem {
  id: string;
  title?: string;
  full_name?: string;
  email?: string;
  name?: string;
}

interface DebrisCategory {
  count: number;
  items: DebrisItem[];
}

interface DebrisData {
  orphaned_lessons: DebrisCategory;
  orphaned_assignments: DebrisCategory;
  deleted_accounts: DebrisCategory;
  hollow_accounts?: { count: number; items: Array<DebrisItem & { role?: string; reason?: string; created_at?: string }> };
  empty_classes: DebrisCategory;
  disconnected_links?: DebrisCategory;
  stale_unpaid_students?: DebrisCategory;
  purgeable_count?: number;
  total_items: number;
}

interface PurgeCounts {
  orphaned_lessons: number;
  orphaned_assignments: number;
  deleted_accounts: number;
  hollow_accounts?: number;
  disconnected_links: number;
  empty_classes: number;
  stale_unpaid_students?: number;
}

/** Debris purge + full sanitation (repair + purge) — System Health cleanup tab. */
export default function DebrisCleanupPanel() {
  const [data, setData] = useState<DebrisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dryRunResult, setDryRunResult] = useState<{ would_purge: PurgeCounts; repair?: { classAssigned: number; schoolNamesResynced: number } } | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [fullRunning, setFullRunning] = useState(false);
  const [purgeEmptyClasses, setPurgeEmptyClasses] = useState(true);
  const [purgeHollowAccounts, setPurgeHollowAccounts] = useState(true);
  const [minAgeDays, setMinAgeDays] = useState(120);

  const sanitizeBody = (mode: string, dry_run: boolean) => ({
    mode,
    dry_run,
    purge_empty_classes: purgeEmptyClasses,
    purge_hollow_accounts: purgeHollowAccounts,
    min_age_days: minAgeDays,
  });

  const loadDebris = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sanitize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'inspect', min_age_days: minAgeDays }),
      });
      if (!res.ok) throw new Error('Failed to load debris items');
      const json = await res.json();
      setData(json.debris ?? null);
    } catch {
      toast.error('Failed to inspect database debris');
    } finally {
      setLoading(false);
    }
  }, [minAgeDays]);

  useEffect(() => {
    loadDebris();
  }, [loadDebris]);

  const handleDryRun = async () => {
    setInspecting(true);
    try {
      const res = await fetch('/api/admin/sanitize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeBody('full', true)),
      });
      if (!res.ok) throw new Error('Dry run failed');
      const json = await res.json();
      setDryRunResult({ would_purge: json.would_purge, repair: json.repair });
      toast.success(json.message || 'Dry-run completed');
    } catch {
      toast.error('Failed to run dry-run inspection');
    } finally {
      setInspecting(false);
    }
  };

  const handleExecutePurge = async () => {
    if (!confirm(
      `Permanently purge now?\n\n• Soft-deleted accounts\n• Hollow shells (${minAgeDays}+ days, no records)` +
      (purgeEmptyClasses ? '\n• Empty classes' : '') +
      '\n• Orphans & broken links\n• Stale unpaid registrations\n\nLogged in the audit trail. Cannot be undone.',
    )) {
      return;
    }
    setPurging(true);
    try {
      const res = await fetch('/api/admin/sanitize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeBody('purge', false)),
      });
      if (!res.ok) throw new Error('Purge failed');
      const json = await res.json();
      toast.success(json.message || 'Purge completed');
      setDryRunResult(null);
      loadDebris();
    } catch {
      toast.error('Failed to purge debris items');
    } finally {
      setPurging(false);
    }
  };

  const handleFullSanitation = async () => {
    if (!confirm(
      `Run FULL platform sanitation?\n\n1) Safe roster repair\n2) Purge junk + hollow accounts (${minAgeDays}+ days old with zero records)` +
      (purgeEmptyClasses ? '\n   (including empty classes)' : '') +
      '\n\nLogged. Cannot undo purged rows.',
    )) {
      return;
    }
    setFullRunning(true);
    try {
      const res = await fetch('/api/admin/sanitize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeBody('full', false)),
      });
      if (!res.ok) throw new Error('Full sanitation failed');
      const json = await res.json();
      toast.success(json.message || 'Full sanitation completed');
      setDryRunResult(null);
      loadDebris();
    } catch {
      toast.error('Full sanitation failed');
    } finally {
      setFullRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalDebris = data?.total_items ?? 0;
  const purgeable = data?.purgeable_count ?? (
    (data?.orphaned_lessons.count ?? 0) +
    (data?.orphaned_assignments.count ?? 0) +
    (data?.deleted_accounts.count ?? 0) +
    (data?.disconnected_links?.count ?? 0) +
    (data?.hollow_accounts?.count ?? 0) +
    (data?.stale_unpaid_students?.count ?? 0)
  );
  const canPurge = purgeable > 0 || (purgeEmptyClasses && (data?.empty_classes.count ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-black text-foreground">Full platform sanitation</h2>
            </div>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Hollow shells are <span className="font-semibold text-foreground">old empty accounts only</span>
              {' '}({minAgeDays}+ days, never logged in, no class, no submissions, reports, cards, attendance, or payment).
              Fresh registrations are never touched.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDryRun}
              disabled={inspecting || fullRunning || purging}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-primary/30 bg-background text-primary hover:bg-primary/10 text-xs font-bold transition-all disabled:opacity-50"
            >
              <EyeIcon className="w-4 h-4" />
              {inspecting ? 'Inspecting…' : 'Dry-run'}
            </button>
            <button
              type="button"
              onClick={handleFullSanitation}
              disabled={fullRunning || purging || inspecting}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 text-xs font-black transition-all disabled:opacity-40"
            >
              <ShieldCheckIcon className={`w-4 h-4 ${fullRunning ? 'animate-pulse' : ''}`} />
              {fullRunning ? 'Sanitizing…' : 'Run full sanitation'}
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={purgeHollowAccounts}
              onChange={(e) => setPurgeHollowAccounts(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary w-4 h-4"
            />
            Purge old hollow shells
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={purgeEmptyClasses}
              onChange={(e) => setPurgeEmptyClasses(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary w-4 h-4"
            />
            Include empty classes
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Shell must be older than
            <select
              value={minAgeDays}
              onChange={(e) => setMinAgeDays(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold text-foreground"
            >
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={120}>120 days</option>
              <option value={180}>180 days</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Purge-only (no repair). Old hollow shells, soft-deleted accounts, orphans, broken links
          {purgeEmptyClasses ? ', empty classes' : ''}.
        </p>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExecutePurge}
            disabled={purging || fullRunning || !canPurge}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all disabled:opacity-40"
          >
            <TrashIcon className="w-4 h-4" />
            {purging ? 'Purging…' : 'Purge only'}
          </button>
          <button
            type="button"
            onClick={loadDebris}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {dryRunResult && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black text-sm">
            <CheckCircleIcon className="w-5 h-5" />
            Dry-run ready (nothing deleted)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {([
              ['Old hollow shells', dryRunResult.would_purge.hollow_accounts ?? 0],
              ['Soft-deleted', dryRunResult.would_purge.deleted_accounts],
              ['Stale unpaid', dryRunResult.would_purge.stale_unpaid_students ?? 0],
              ['Broken links', dryRunResult.would_purge.disconnected_links],
              ['Orphan lessons', dryRunResult.would_purge.orphaned_lessons],
              ['Orphan assignments', dryRunResult.would_purge.orphaned_assignments],
              ['Empty classes', dryRunResult.would_purge.empty_classes],
            ] as const).map(([label, n]) => (
              <div key={label} className="bg-background/80 rounded-xl p-3 border border-emerald-500/20">
                <span className="text-[10px] font-black uppercase text-muted-foreground block">{label}</span>
                <span className="text-lg font-black text-foreground">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard label="Old hollow shells" count={data?.hollow_accounts?.count ?? 0} hint={`${minAgeDays}+ days · no records · not fresh`} Icon={UserIcon} accent="text-rose-600 dark:text-rose-400" />
        <MetricCard label="Soft-deleted accounts" count={data?.deleted_accounts.count ?? 0} hint="Already marked deleted" Icon={UserIcon} accent="text-orange-600 dark:text-orange-400" />
        <MetricCard label="Stale unpaid regs" count={data?.stale_unpaid_students?.count ?? 0} hint="Pending · unpaid · 14+ days" Icon={DocumentTextIcon} accent="text-amber-600 dark:text-amber-400" />
        <MetricCard label="Broken parent links" count={data?.disconnected_links?.count ?? 0} hint="Parent or student gone" Icon={UserGroupIcon} accent="text-orange-600 dark:text-orange-400" />
        <MetricCard label="Orphaned content" count={(data?.orphaned_lessons.count ?? 0) + (data?.orphaned_assignments.count ?? 0)} hint="Missing lesson plans" Icon={DocumentTextIcon} accent="text-violet-600 dark:text-violet-400" />
        <MetricCard label="Empty classes" count={data?.empty_classes.count ?? 0} hint={purgeEmptyClasses ? 'Will purge if enabled' : 'Listed only'} Icon={UserGroupIcon} accent="text-teal-600 dark:text-teal-400" />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between gap-3">
          <h2 className="font-black text-foreground text-base">Cleanup queue ({totalDebris})</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {data?.hollow_accounts?.count ?? 0} old shells · fresh regs excluded
          </span>
        </div>

        {totalDebris === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <p className="font-black text-foreground text-lg">No old hollow shells found</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Nothing older than {minAgeDays} days with zero records. Fresh registrations are never listed here.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {(data?.hollow_accounts?.count ?? 0) > 0 && (
              <DebrisList
                title={purgeHollowAccounts ? `Old hollow shells (${minAgeDays}+ days, no records)` : 'Old hollow shells (enable checkbox to purge)'}
                tone="text-rose-600 dark:text-rose-400"
                items={(data?.hollow_accounts?.items ?? []).map((u) => ({
                  id: u.id,
                  primary: u.full_name || 'Hollow account',
                  secondary: `${u.email || u.id}${u.reason ? ` · ${u.reason}` : ''}`,
                  badge: u.role || 'shell',
                }))}
              />
            )}
            {(data?.stale_unpaid_students?.count ?? 0) > 0 && (
              <DebrisList
                title="Stale unpaid registrations (14+ days, never paid)"
                tone="text-amber-600 dark:text-amber-400"
                items={(data?.stale_unpaid_students?.items ?? []).map((s) => ({
                  id: s.id,
                  primary: s.full_name || 'Unpaid registration',
                  secondary: s.email || s.id,
                  badge: 'Unpaid',
                }))}
              />
            )}
            {(data?.empty_classes.count ?? 0) > 0 && (
              <DebrisList
                title={purgeEmptyClasses ? 'Empty classes (will be purged)' : 'Empty classes (listed only)'}
                tone="text-teal-600 dark:text-teal-400"
                items={(data?.empty_classes.items ?? []).map((c) => ({
                  id: c.id,
                  primary: c.name || 'Unnamed class',
                  secondary: `ID: ${c.id}`,
                  badge: 'Empty',
                }))}
              />
            )}
            {(data?.deleted_accounts.count ?? 0) > 0 && (
              <DebrisList
                title="Soft-deleted accounts"
                tone="text-orange-600 dark:text-orange-400"
                items={(data?.deleted_accounts.items ?? []).map((u) => ({
                  id: u.id,
                  primary: u.full_name || 'Deleted account',
                  secondary: u.email || u.id,
                  badge: 'Deleted',
                }))}
              />
            )}
            {(data?.orphaned_lessons.count ?? 0) > 0 && (
              <DebrisList
                title="Orphaned lessons"
                tone="text-amber-600 dark:text-amber-400"
                items={(data?.orphaned_lessons.items ?? []).map((l) => ({
                  id: l.id,
                  primary: l.title || 'Untitled lesson',
                  secondary: `ID: ${l.id}`,
                  badge: 'Orphan',
                }))}
              />
            )}
            {(data?.orphaned_assignments.count ?? 0) > 0 && (
              <DebrisList
                title="Orphaned assignments"
                tone="text-violet-600 dark:text-violet-400"
                items={(data?.orphaned_assignments.items ?? []).map((a) => ({
                  id: a.id,
                  primary: a.title || 'Untitled assignment',
                  secondary: `ID: ${a.id}`,
                  badge: 'Orphan',
                }))}
              />
            )}
            {(data?.disconnected_links?.count ?? 0) > 0 && (
              <DebrisList
                title="Broken parent links"
                tone="text-orange-600 dark:text-orange-400"
                items={(data?.disconnected_links?.items ?? []).map((l) => ({
                  id: l.id,
                  primary: 'Parent ↔ student link',
                  secondary: `ID: ${l.id}`,
                  badge: 'Disconnected',
                }))}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label, count, hint, Icon, accent,
}: {
  label: string;
  count: number;
  hint: string;
  Icon: typeof DocumentTextIcon;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-bold">{label}</span>
        <Icon className={`w-5 h-5 ${accent}`} />
      </div>
      <p className="text-2xl font-black text-foreground">{count}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function DebrisList({
  title, tone, items,
}: {
  title: string;
  tone: string;
  items: Array<{ id: string; primary: string; secondary: string; badge: string }>;
}) {
  return (
    <div className="space-y-2">
      <h3 className={`text-xs font-black uppercase tracking-widest ${tone}`}>{title}</h3>
      <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background/50">
        {items.map((item) => (
          <div key={item.id} className="p-3.5 flex items-center justify-between text-xs gap-3">
            <div className="min-w-0">
              <p className="font-bold text-foreground truncate">{item.primary}</p>
              <p className="text-[10px] text-muted-foreground font-mono truncate">{item.secondary}</p>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
              {item.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
