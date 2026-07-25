'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  TrashIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EyeIcon,
  CheckCircleIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  DocumentTextIcon,
  UserIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface DebrisItem {
  id: string;
  title?: string;
  full_name?: string;
  email?: string;
  name?: string;
  orphaned_plan_id?: string;
}

interface DebrisCategory {
  count: number;
  items: DebrisItem[];
}

interface DebrisData {
  orphaned_lessons: DebrisCategory;
  orphaned_assignments: DebrisCategory;
  deleted_accounts: DebrisCategory;
  empty_classes: DebrisCategory;
  total_items: number;
}

interface DryRunResult {
  dry_run: boolean;
  would_purge: {
    orphaned_lessons: number;
    orphaned_assignments: number;
    deleted_accounts: number;
  };
}

export default function AdminDebrisPage() {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<DebrisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'lessons' | 'assignments' | 'accounts' | 'classes'>('all');

  const isAdmin = profile?.role === 'admin';

  const loadDebris = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/debris');
      if (!res.ok) throw new Error('Failed to load debris items');
      const json = await res.json();
      setData(json.debris ?? null);
    } catch {
      toast.error('Failed to inspect database debris');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      loadDebris();
    }
  }, [authLoading, isAdmin, loadDebris]);

  const handleDryRun = async () => {
    setInspecting(true);
    try {
      const res = await fetch('/api/admin/debris?dry_run=true', { method: 'DELETE' });
      if (!res.ok) throw new Error('Dry run failed');
      const json = await res.json();
      setDryRunResult(json);
      toast.success('Dry-run inspection completed cleanly!');
    } catch {
      toast.error('Failed to run dry-run inspection');
    } finally {
      setInspecting(false);
    }
  };

  const handleExecutePurge = async () => {
    if (!confirm('Are you sure you want to permanently purge these legacy items? This action is logged in audit trails.')) {
      return;
    }
    setPurging(true);
    try {
      const res = await fetch('/api/admin/debris', { method: 'DELETE' });
      if (!res.ok) throw new Error('Purge failed');
      const json = await res.json();
      toast.success(json.message || 'Purge completed successfully!');
      setDryRunResult(null);
      loadDebris();
    } catch {
      toast.error('Failed to purge debris items');
    } finally {
      setPurging(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ExclamationTriangleIcon className="w-16 h-16 text-rose-500/40" />
        <p className="text-muted-foreground text-lg font-semibold">Admin access required</p>
      </div>
    );
  }

  const totalDebris = data?.total_items ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 max-w-7xl mx-auto space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrashIcon className="w-5 h-5 text-rose-500" />
            <span className="text-xs font-black uppercase tracking-widest text-rose-500">System Maintenance</span>
          </div>
          <h1 className="text-3xl font-black text-foreground">Archive & Debris Inspector</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Inspect, dry-run, and clean up legacy test records, deleted accounts, and orphaned database items.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDryRun}
            disabled={inspecting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-all disabled:opacity-50"
          >
            <EyeIcon className="w-4 h-4" />
            {inspecting ? 'Inspecting…' : 'Run Dry-Run Inspection'}
          </button>

          <button
            onClick={handleExecutePurge}
            disabled={purging || totalDebris === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md shadow-rose-600/20 transition-all disabled:opacity-40"
          >
            <TrashIcon className="w-4 h-4" />
            {purging ? 'Purging…' : 'Execute Purge'}
          </button>
        </div>
      </div>

      {/* ── Dry Run Summary Banner ── */}
      {dryRunResult && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
            <CheckCircleIcon className="w-5 h-5" />
            Dry-Run Inspection Results Ready
          </div>
          <p className="text-xs text-emerald-300/90">
            A dry run simulates the purge operation without modifying your database. Here is what would be cleaned up:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-background/80 rounded-xl p-3 border border-emerald-500/20">
              <span className="text-[10px] font-black uppercase text-muted-foreground block">Orphaned Lessons</span>
              <span className="text-lg font-black text-foreground">{dryRunResult.would_purge.orphaned_lessons}</span>
            </div>
            <div className="bg-background/80 rounded-xl p-3 border border-emerald-500/20">
              <span className="text-[10px] font-black uppercase text-muted-foreground block">Orphaned Assignments</span>
              <span className="text-lg font-black text-foreground">{dryRunResult.would_purge.orphaned_assignments}</span>
            </div>
            <div className="bg-background/80 rounded-xl p-3 border border-emerald-500/20">
              <span className="text-[10px] font-black uppercase text-muted-foreground block">Deleted Accounts</span>
              <span className="text-lg font-black text-foreground">{dryRunResult.would_purge.deleted_accounts}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Overview Metrics Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold">Orphaned Lessons</span>
            <DocumentTextIcon className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-foreground">{data?.orphaned_lessons.count ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">Lessons with missing lesson plans</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold">Orphaned Assignments</span>
            <DocumentTextIcon className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-foreground">{data?.orphaned_assignments.count ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">Assignments with missing lesson plans</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold">Soft-Deleted Accounts</span>
            <UserIcon className="w-5 h-5 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-foreground">{data?.deleted_accounts.count ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">Accounts flagged is_deleted = true</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold">Empty Classes</span>
            <UserGroupIcon className="w-5 h-5 text-teal-500" />
          </div>
          <p className="text-2xl font-black text-foreground">{data?.empty_classes.count ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">Cohorts with 0 active students</p>
        </div>
      </div>

      {/* ── Inspection Tables ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-black text-foreground text-base">Inspected Debris Items ({totalDebris})</h2>
          <button
            onClick={loadDebris}
            className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {totalDebris === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <p className="font-black text-foreground text-lg">System Completely Clean!</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No orphaned lessons, deleted accounts, or legacy debris found in your database.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Empty Classes Table */}
            {data?.empty_classes.count! > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-teal-400">Empty Classes (0 Students)</h3>
                <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background/50">
                  {data?.empty_classes.items.map((c) => (
                    <div key={c.id} className="p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-foreground">{c.name || 'Unnamed Class'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">ID: {c.id}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        Empty Cohort
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deleted Accounts Table */}
            {data?.deleted_accounts.count! > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-rose-400">Soft-Deleted Accounts</h3>
                <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background/50">
                  {data?.deleted_accounts.items.map((u) => (
                    <div key={u.id} className="p-3.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-foreground">{u.full_name || 'Deleted Account'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{u.email || u.id}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        Flagged Deleted
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
