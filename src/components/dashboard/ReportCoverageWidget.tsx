'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';

type Pending = { id: string; full_name: string | null; className: string | null; school_name: string | null; drafted: boolean };
type Coverage = { termLabel: string; total: number; withReport: number; pendingCount: number; pending: Pending[] };

/**
 * Report-coverage summary for admins / teachers / schools: how many students have a PUBLISHED
 * progress report THIS term and exactly who is still pending — so a school sees the gap and who
 * to attend to without opening every class. Teachers/admins can jump straight to the builder;
 * everyone can export the pending list.
 */
export default function ReportCoverageWidget() {
  const { profile } = useAuth();
  const [cov, setCov] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const canBuild = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reports/coverage', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled && !j.error) setCov(j); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="bg-card border border-border rounded-2xl h-28 animate-pulse" />;
  if (!cov || cov.total === 0) return null;

  const pct = cov.total ? Math.round((cov.withReport / cov.total) * 100) : 0;
  const allDone = cov.pendingCount === 0;

  const exportCsv = () => {
    const rows = [['Student', 'Class', 'School', 'Status'],
      ...cov.pending.map(p => [p.full_name ?? '', p.className ?? '', p.school_name ?? '', p.drafted ? 'Drafted (unpublished)' : 'No report'])];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `pending-reports-${cov.termLabel.replace(/\s+/g, '-')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // group pending by class for the drill-down
  const byClass: Record<string, Pending[]> = {};
  for (const p of cov.pending) (byClass[p.className ?? 'Unassigned'] ??= []).push(p);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Progress Reports</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">{cov.termLabel}</span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {cov.withReport}<span className="text-muted-foreground">/{cov.total}</span>
            <span className={`ml-2 text-sm font-black ${allDone ? 'text-emerald-400' : 'text-amber-400'}`}>
              {allDone ? 'all published ✓' : `${cov.pendingCount} pending`}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!allDone && (
            <button onClick={() => setOpen(o => !o)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground hover:border-primary/50">
              {open ? 'Hide' : 'Show'} pending
            </button>
          )}
          {!allDone && (
            <button onClick={exportCsv} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-black text-foreground hover:border-primary/50">
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* coverage bar */}
      <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${allDone ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
      </div>

      {open && !allDone && (
        <div className="mt-4 max-h-72 overflow-y-auto space-y-3 pr-1">
          {Object.entries(byClass).sort((a, b) => a[0].localeCompare(b[0])).map(([cls, kids]) => (
            <div key={cls}>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{cls} · {kids.length}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {kids.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{p.full_name}</span>
                      {p.drafted && <span className="text-[10px] font-black uppercase tracking-wide text-amber-400">Draft — not published</span>}
                    </span>
                    {canBuild && (
                      <Link href={`/dashboard/reports/builder?student=${p.id}`} className="flex-shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-primary hover:bg-primary/20">
                        Build
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
