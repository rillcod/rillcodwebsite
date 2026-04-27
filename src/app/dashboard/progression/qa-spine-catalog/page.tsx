'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon, ArrowLeftIcon } from '@/lib/icons';
import Link from 'next/link';
import { toast } from 'sonner';

type CatalogSummary = {
  total_rows: number;
  active_catalog_version: string | null;
  program_count: number;
  last_seed_at: string | null;
  lane_counts: Array<{ lane_index: number; count: number }>;
  versions: Array<{ catalog_version: string; count: number }>;
};

// Plain English lane descriptions
const LANE_DESCRIPTIONS: Record<number, string> = {
  0: 'Introduction & warm-up activities',
  1: 'Core teaching content',
  2: 'Practice & application exercises',
  3: 'Assessment & review tasks',
  4: 'Extension & enrichment activities',
};

export default function QaSpineCatalogPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher'].includes(profile?.role ?? '');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CatalogSummary | null>(null);

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await fetch('/api/platform-syllabus-catalog/summary');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData((json.data ?? null) as CatalogSummary | null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadSummary();
  }, [canView]);

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return (
    <div className="p-6 text-sm text-muted-foreground">Admin or Teacher access required.</div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> Back to LMS Settings
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-black">Lesson Template Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              This is the master library of pre-built lesson structures that the AI uses when generating your syllabuses and lesson plans.
              You don't edit this directly — it's a read-only health check to confirm the library is loaded and working.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30 shrink-0"
          >
            <ArrowPathIcon className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* What this means */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 text-sm space-y-2">
        <p className="font-black text-amber-400">What does this page do?</p>
        <p className="text-muted-foreground leading-relaxed">
          When you click "Generate Syllabus" or "Generate Lesson Plan", the AI pulls from this template library to structure each week's content.
          Think of it as a recipe book — the AI follows these recipes to build your lessons in the right order.
          If the library is empty or outdated, your generated content may be incomplete.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <span className="text-foreground font-bold">You don't need to do anything here</span> unless the numbers below show 0 rows or a very old "last updated" date.
          If that happens, contact your platform admin to re-seed the library.
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Library version</p>
          <p className="text-lg font-black">{data?.active_catalog_version ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Current active version</p>
        </div>
        <div className={`bg-card border rounded-xl p-4 ${(data?.total_rows ?? 0) === 0 ? 'border-rose-500/40' : 'border-border'}`}>
          <p className="text-xs text-muted-foreground">Total templates</p>
          <p className={`text-lg font-black ${(data?.total_rows ?? 0) === 0 ? 'text-rose-400' : ''}`}>{data?.total_rows ?? 0}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{(data?.total_rows ?? 0) === 0 ? '⚠️ Library is empty' : 'Templates loaded'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Programs covered</p>
          <p className="text-lg font-black">{data?.program_count ?? 0}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Programs with templates</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Last updated</p>
          <p className="text-sm font-black">{data?.last_seed_at ? new Date(data.last_seed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
          <p className="text-[10px] text-muted-foreground mt-1">When library was last refreshed</p>
        </div>
      </div>

      {/* Lane breakdown */}
      {(data?.lane_counts ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div>
            <p className="text-sm font-black">Lesson structure breakdown</p>
            <p className="text-xs text-muted-foreground mt-0.5">Each lesson is built in stages (lanes). Here's how many templates exist for each stage.</p>
          </div>
          <div className="space-y-2">
            {(data?.lane_counts ?? []).map(row => (
              <div key={row.lane_index} className="flex items-center gap-3">
                <div className="w-32 shrink-0">
                  <p className="text-xs font-bold text-foreground">Stage {row.lane_index + 1}</p>
                  <p className="text-[10px] text-muted-foreground">{LANE_DESCRIPTIONS[row.lane_index] ?? 'Content stage'}</p>
                </div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${Math.min(100, (row.count / Math.max(...(data?.lane_counts ?? []).map(r => r.count), 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-black text-muted-foreground w-12 text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Version history */}
      {(data?.versions ?? []).length > 1 && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <p className="text-sm font-black">Version history</p>
          <div className="space-y-2">
            {(data?.versions ?? []).map(row => (
              <div key={row.catalog_version} className="flex items-center justify-between text-xs p-2 rounded-lg border border-border bg-background/50">
                <span className={row.catalog_version === data?.active_catalog_version ? 'font-black text-primary' : 'text-muted-foreground'}>
                  {row.catalog_version}
                  {row.catalog_version === data?.active_catalog_version && ' (active)'}
                </span>
                <span className="font-bold">{row.count} templates</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
