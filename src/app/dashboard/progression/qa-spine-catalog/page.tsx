'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon } from '@/lib/icons';
import { toast } from 'sonner';

type CatalogSummary = {
  total_rows: number;
  active_catalog_version: string | null;
  program_count: number;
  last_seed_at: string | null;
  lane_counts: Array<{ lane_index: number; count: number }>;
  versions: Array<{ catalog_version: string; count: number }>;
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
      if (!res.ok) throw new Error(json.error || 'Failed to load catalog summary');
      setData((json.data ?? null) as CatalogSummary | null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load QA catalog manager');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadSummary();
  }, [canView]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canView) {
    return <div className="p-6 text-sm text-muted-foreground">Admin/Teacher access required.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black">QA Spine Catalog Manager (Read-only)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Version visibility for the seeded QA catalog. Use this to monitor catalog health and lane structure.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSummary()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Active catalog version</p>
          <p className="text-lg font-black">{data?.active_catalog_version ?? '-'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total rows</p>
          <p className="text-lg font-black">{data?.total_rows ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Programs covered</p>
          <p className="text-lg font-black">{data?.program_count ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Last seed timestamp</p>
          <p className="text-sm font-black">{data?.last_seed_at ? new Date(data.last_seed_at).toLocaleString() : '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-black mb-2">Lane counts</h2>
          <div className="space-y-2">
            {(data?.lane_counts ?? []).map((row) => (
              <div key={row.lane_index} className="text-xs p-2 rounded border border-border bg-background/50 flex items-center justify-between">
                <span>Lane {row.lane_index}</span>
                <span className="font-bold">{row.count} rows</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-black mb-2">Catalog versions</h2>
          <div className="space-y-2">
            {(data?.versions ?? []).map((row) => (
              <div key={row.catalog_version} className="text-xs p-2 rounded border border-border bg-background/50 flex items-center justify-between">
                <span>{row.catalog_version}</span>
                <span className="font-bold">{row.count} rows</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="bg-card border border-border rounded-2xl p-4">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-muted-foreground">
          Advanced details
        </summary>
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          <p>Database: <code>public.platform_syllabus_week_template</code></p>
          <p>API: <code>GET /api/platform-syllabus-catalog/summary</code>, <code>GET /api/platform-syllabus-template</code></p>
          <p>Catalog field: <code>catalog_version</code></p>
        </div>
      </details>
    </div>
  );
}
