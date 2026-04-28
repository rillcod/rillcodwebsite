'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon, ArrowLeftIcon, ShieldCheckIcon, MagnifyingGlassIcon } from '@/lib/icons';
import { toast } from 'sonner';
import Link from 'next/link';

type AuditRow = {
  id: string;
  lesson_plan_id: string;
  school_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  year_number: number | null;
  term_number: number | null;
  week_number: number | null;
  action_type: string;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  override_unlock: { label: 'Security Override', desc: 'Content was manually unlocked outside normal window.', color: 'text-amber-400 bg-amber-400/5 border-amber-400/20' },
  week_edit_while_locked: { label: 'Protected Edit', desc: 'Syllabus content modified while under lock.', color: 'text-rose-400 bg-rose-400/5 border-rose-400/20' },
  term_status_change: { label: 'Academic Shift', desc: 'Global status update for a term or year.', color: 'text-blue-400 bg-blue-400/5 border-blue-400/20' },
};

function AuditTrailContent() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionType, setActionType] = useState(searchParams.get('action_type') ?? '');
  const [lessonPlanId, setLessonPlanId] = useState(searchParams.get('lesson_plan_id') ?? '');
  const [limit, setLimit] = useState(Math.min(200, Math.max(25, Number(searchParams.get('limit') ?? 50))));

  async function loadRows() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (actionType) params.set('action_type', actionType);
      if (lessonPlanId) params.set('lesson_plan_id', lessonPlanId);
      const res = await fetch(`/api/progression/audit?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Audit sync failed');
      setRows((json.data ?? []) as AuditRow[]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Audit sync failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadRows();
  }, [canView, actionType, lessonPlanId, limit]);

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return <div className="p-20 text-center text-muted-foreground font-bold uppercase tracking-widest">Unauthorized Audit Access</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-12 pb-32">
      {/* Audit Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[3.5rem] p-10 sm:p-16 shadow-2xl">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-slate-500/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />

        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-10 transition-colors relative z-10">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Controls
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 relative z-10">
          <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-4">
              <ShieldCheckIcon className="w-8 h-8 text-primary" />
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-card-foreground leading-tight">Transparency Trail</h1>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed italic max-w-2xl">
              Immutable historical record of critical system overrides and governance interventions
              across the Rillcod ecosystem.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-muted/30 p-2 rounded-[1.5rem] border border-border backdrop-blur-xl shadow-inner">
              <select
                title="Governance Types"
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="bg-transparent text-[10px] font-black uppercase tracking-[0.2em] px-6 py-3 focus:outline-none min-w-[220px] appearance-none"
              >
                <option value="">All Governance Types</option>
                <option value="override_unlock">Security Overrides</option>
                <option value="week_edit_while_locked">Protected Edits</option>
                <option value="term_status_change">Academic Shifts</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void loadRows()}
              className="p-5 rounded-[1.5rem] bg-card border border-border hover:border-primary/50 transition-all shadow-2xl group"
            >
              <ArrowPathIcon className={`w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Audit Timeline */}
      <div className="space-y-10 relative before:absolute before:left-[1.75rem] sm:before:left-[2.25rem] before:top-4 before:bottom-4 before:w-px before:bg-border/60">
        {rows.map((row) => {
          const meta = ACTION_LABELS[row.action_type] || { label: row.action_type, desc: 'Administrative action performed.', color: 'text-muted-foreground bg-muted/10 border-border' };

          return (
            <div key={row.id} className="relative pl-16 sm:pl-24 group">
              {/* Timeline Node */}
              <div className="absolute left-0 sm:left-4 top-2 w-12 h-12 sm:w-16 sm:h-16 rounded-[1.5rem] bg-card border border-border flex items-center justify-center z-10 group-hover:border-primary/50 transition-all duration-500 shadow-2xl">
                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full ${meta.label === 'Security Override' ? 'bg-amber-400 animate-pulse' : meta.label === 'Protected Edit' ? 'bg-rose-400' : 'bg-primary shadow-[0_0_15px_rgba(124,58,237,0.5)]'}`} />
              </div>

              <div className="bg-card border border-border rounded-[3rem] p-10 sm:p-14 space-y-10 hover:border-primary/20 transition-all duration-700 shadow-[0_30px_100px_rgba(0,0,0,0.05)] hover:shadow-[0_50px_150px_rgba(0,0,0,0.1)]">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] font-black text-foreground uppercase tracking-[0.2em] bg-muted/30 px-3 py-1 rounded-lg">
                        {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.2em]">
                        {new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight group-hover:text-primary transition-colors duration-500 leading-tight">{meta.desc}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground italic">
                      Authorized by: <span className="font-black text-foreground uppercase tracking-widest not-italic">{row.actor_role || 'System Root'}</span>
                      {row.school_id && <><span className="opacity-30">·</span> Node: <span className="font-bold text-foreground opacity-100">{row.school_id}</span></>}
                      {row.lesson_plan_id && <><span className="opacity-30">·</span> Target: <span className="font-bold text-foreground opacity-100">{row.lesson_plan_id}</span></>}
                    </div>
                  </div>

                  {(row.year_number || row.term_number || row.week_number) && (
                    <div className="px-6 py-3 bg-muted/20 rounded-2xl border border-border text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-3 h-fit shadow-inner group-hover:border-primary/20 transition-colors">
                      {row.year_number && `Y${row.year_number}`} {row.term_number && `T${row.term_number}`} {row.week_number && `W${row.week_number}`}
                    </div>
                  )}
                </div>

                {row.reason && (
                  <div className="p-8 bg-muted/10 border border-border/50 rounded-[2rem] shadow-inner relative overflow-hidden group/reason">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/reason:opacity-30 transition-opacity">
                      <MagnifyingGlassIcon className="w-8 h-8" />
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-4 opacity-50">Administrative Rationale</p>
                    <p className="text-lg text-foreground leading-relaxed italic opacity-90">"{row.reason}"</p>
                  </div>
                )}

                <details className="group/diff">
                  <summary className="cursor-pointer list-none flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.3em] text-primary hover:opacity-80 transition-all">
                    <span className="bg-primary/10 px-4 py-2 rounded-xl">Analyze Delta View</span>
                    <div className="flex-1 h-px bg-primary/20 group-open/diff:bg-primary/40" />
                  </summary>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 mt-10 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em] ml-6">Pre-Revision State</p>
                      <pre className="text-[11px] p-10 bg-background border border-border rounded-[2.5rem] overflow-auto max-h-[400px] font-mono leading-relaxed shadow-inner scrollbar-hide">
                        {JSON.stringify(row.before_state ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase text-primary tracking-[0.3em] ml-6">Post-Revision State</p>
                      <pre className="text-[11px] p-10 bg-primary/5 border border-primary/20 rounded-[2.5rem] overflow-auto max-h-[400px] font-mono leading-relaxed text-primary shadow-inner scrollbar-hide">
                        {JSON.stringify(row.after_state ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="py-48 text-center space-y-8 bg-card border-2 border-dashed border-border rounded-[4rem] mx-4 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <ShieldCheckIcon className="w-20 h-20 text-primary/20 mx-auto" />
            <div className="space-y-3 relative z-10">
              <p className="text-3xl font-black text-foreground tracking-tighter uppercase">Trail Integrity: Clean</p>
              <p className="text-lg text-muted-foreground italic max-w-lg mx-auto leading-relaxed">
                No governance overrides or administrative exceptions have been recorded for the current scope.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProgressionAuditPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <AuditTrailContent />
    </Suspense>
  );
}
