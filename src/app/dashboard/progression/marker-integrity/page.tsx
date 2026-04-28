'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon, ArrowLeftIcon, ExclamationTriangleIcon } from '@/lib/icons';
import { toast } from 'sonner';
import Link from 'next/link';

type IntegrityResponse = {
  summary: {
    assignments_total: number;
    decks_total: number;
    assignments_with_marker: number;
    decks_with_marker: number;
    assignment_duplicate_markers: number;
    deck_duplicate_markers: number;
    shared_markers_between_assignments_and_decks: number;
  };
  assignmentDuplicates: Array<{ marker: string; count: number }>;
  deckDuplicates: Array<{ marker: string; count: number }>;
  sharedMarkers: Array<{ marker: string; assignments: number; decks: number }>;
};

export default function MarkerIntegrityPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IntegrityResponse | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/progression/marker-integrity');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Diagnostic failed');
      setData((json.data ?? null) as IntegrityResponse | null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Integrity check failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView]);

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return <div className="p-20 text-center text-muted-foreground font-bold uppercase tracking-widest">Unauthorized Access</div>;

  const s = data?.summary;
  const totalConflicts = (s?.assignment_duplicate_markers ?? 0) + (s?.deck_duplicate_markers ?? 0) + (s?.shared_markers_between_assignments_and_decks ?? 0);
  const isHealthy = totalConflicts === 0;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-10">
      {/* Guardian Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[2.5rem] p-8 sm:p-14 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Controls
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-10 relative z-10">
          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tight text-card-foreground leading-tight">Content Integrity Guard</h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed italic">
              Platform-wide diagnostic of academic markers. Ensures every objective 
              has a unique identity to prevent pedagogical collisions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center gap-3 shrink-0 shadow-xl"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /> Run Diagnostic
          </button>
        </div>
      </div>

      {/* Global Health Status */}
      <div className={`rounded-[3rem] border p-1.5 transition-all shadow-2xl ${isHealthy ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <div className="bg-card rounded-[calc(2.5rem-1px)] p-10 flex flex-col sm:flex-row items-center gap-10">
          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shrink-0 shadow-2xl ${isHealthy ? 'bg-emerald-500 shadow-emerald-500/40 text-white' : 'bg-amber-500 shadow-amber-500/40 text-white'}`}>
             {isHealthy ? <div className="w-10 h-10 border-4 border-white rounded-full flex items-center justify-center font-black">✓</div> : <ExclamationTriangleIcon className="w-10 h-10" />}
          </div>
          <div className="flex-1 text-center sm:text-left space-y-1">
            <p className="text-2xl font-black text-card-foreground tracking-tight">System Integrity: {isHealthy ? 'Optimum' : 'Conflict Detected'}</p>
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              {isHealthy 
                ? 'All pedagogical identifiers are unique and consistent across the master curriculum.' 
                : `Detected ${totalConflicts} structural identity conflicts that require administrative resolution.`}
            </p>
          </div>
          <div className="px-6 py-3 bg-muted/30 rounded-2xl border border-border text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground shadow-inner">
             {(s?.assignments_total ?? 0) + (s?.decks_total ?? 0)} Nodes Verified
          </div>
        </div>
      </div>

      {/* Metric Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-4">
        {[
          { label: 'Total Assignments', value: s?.assignments_total ?? 0, sub: `${s?.assignments_with_marker ?? 0} Identifiable` },
          { label: 'Learning Decks', value: s?.decks_total ?? 0, sub: `${s?.decks_with_marker ?? 0} Identifiable` },
          { label: 'Conflicts Found', value: totalConflicts, sub: 'Non-unique markers', color: totalConflicts > 0 ? 'text-rose-400' : 'text-foreground' },
          { label: 'Shared Domain', value: s?.shared_markers_between_assignments_and_decks ?? 0, sub: 'Cross-content overlap' },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-[2.5rem] p-8 space-y-3 shadow-xl hover:border-primary/30 transition-all group">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-primary transition-colors">{m.label}</p>
            <p className={`text-5xl font-black tracking-tighter ${m.color || 'text-foreground'}`}>{m.value}</p>
            <p className="text-[10px] font-bold text-muted-foreground italic">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Conflict Resolution Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4">
        {[
          { title: 'Assignment Collisions', desc: 'Duplicate markers in assignment database.', data: data?.assignmentDuplicates, color: 'amber' },
          { title: 'Deck Collisions', desc: 'Duplicate markers in deck policies.', data: data?.deckDuplicates, color: 'amber' },
          { title: 'Shared Collisions', desc: 'Pedagogical markers overlapping categories.', data: data?.sharedMarkers, color: 'rose' },
        ].map((col, i) => (
          <div key={i} className="bg-card border border-border rounded-[3rem] overflow-hidden flex flex-col shadow-2xl hover:border-primary/20 transition-all">
            <div className="p-10 border-b border-border bg-muted/20">
               <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.2em]">{col.title}</h2>
               <p className="text-[10px] text-muted-foreground mt-2 italic">{col.desc}</p>
            </div>
            <div className="p-10 space-y-4 flex-1 overflow-auto max-h-[400px] bg-card/30 backdrop-blur-sm">
               {col.data?.length ? col.data.map((row: any, idx: number) => (
                 <div key={idx} className="p-5 bg-background border border-border rounded-[1.5rem] space-y-3 shadow-sm hover:border-primary/20 transition-all group">
                   <p className={`text-[10px] font-mono font-bold truncate group-hover:text-primary transition-colors ${col.color === 'rose' ? 'text-rose-400' : 'text-amber-400'}`}>{row.marker}</p>
                   <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-50">Impact Factor</span>
                      <span className="text-xs font-black text-foreground">{row.count || (row.assignments + row.decks)}</span>
                   </div>
                 </div>
               )) : (
                 <div className="py-20 text-center">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-30 italic">No collisions detected</p>
                 </div>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
