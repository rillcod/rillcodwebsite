'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  formatSpecialDate,
  specialProgramPublicPath,
  type SpecialProgramPage,
} from '@/lib/special-programs/types';
import { brandContact } from '@/config/brand';
import SpecialProgramVisualBuilder, {
  toSpecialForm,
} from '@/components/special-programs/SpecialProgramVisualBuilder';

export default function SpecialProgramsAdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SpecialProgramPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SpecialProgramPage | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderKey, setBuilderKey] = useState(0);
  const [preparingId, setPreparingId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : brandContact.siteUrl;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/special-programs', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load');
      setRows(j.data || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load special programmes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    load();
  }, [authLoading, isAdmin, load]);

  const openCreate = () => {
    setEditing(null);
    setBuilderKey((k) => k + 1);
    setShowBuilder(true);
  };

  const openEdit = async (p: SpecialProgramPage) => {
    setEditing(p);
    setBuilderKey((k) => k + 1);
    setShowBuilder(true);
    try {
      const res = await fetch(`/api/special-programs/${p.id}`, { cache: 'no-store' });
      const j = await res.json();
      if (res.ok && j.data) {
        setEditing(j.data);
        setBuilderKey((k) => k + 1);
      }
    } catch {
      /* list row is enough to start editing */
    }
  };

  const launchTeachingDirectly = async (p: SpecialProgramPage, opts?: { forceRebuild?: boolean }) => {
    if (!p.is_published) {
      toast.error('Please publish the page first before preparing teaching');
      openEdit(p);
      return;
    }
    if (!p.program_id) {
      toast.error('Please choose a parent Programme under Basics & fees first');
      openEdit(p);
      return;
    }
    if (!p.school_id) {
      toast.error('Please choose a School under Basics & fees first');
      openEdit(p);
      return;
    }

    setPreparingId(p.id);
    try {
      const res = await fetch(`/api/special-programs/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          launch_teaching: true,
          is_published: true,
          program_id: p.program_id,
          school_id: p.school_id,
          force_rebuild: opts?.forceRebuild === true,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j.teaching_error || j.error || 'Could not prepare teaching');
      }
      toast.success(
        j.teaching_message ||
          (opts?.forceRebuild
            ? 'Curriculum completely rebuilt! Week 1 lesson plan, classwork & homework refreshed.'
            : 'Week 1 lesson plan, classwork & homework prepared! Check Teaching Approvals.'),
      );
      load();
    } catch (e: any) {
      toast.error(e.message || 'Could not prepare teaching');
    } finally {
      setPreparingId(null);
    }
  };

  const copyUrl = (slug: string) => {
    const url = `${siteOrigin}${specialProgramPublicPath(slug)}`;
    navigator.clipboard?.writeText(url);
    toast.success('Public URL copied to clipboard');
  };

  const setFeatured = async (id: string) => {
    try {
      const res = await fetch(`/api/special-programs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set_featured: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success('Homepage button now points to this programme');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to set featured');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this special programme page? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/special-programs/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success('Programme page deleted');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  if (authLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return <div className="p-8 text-sm text-rose-600 dark:text-rose-400">Admin access required.</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 mobile-page-root">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academics</p>
          <h1 className="text-2xl font-black text-foreground">Special Programmes & Curriculum Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Build marketing pages, auto-generate week-by-week curriculum, and distribute learning activities and assignments to cohort classes without gaps or manual setup.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity shadow-sm"
        >
          + New special programme
        </button>
      </div>

      {/* 3-Step Guided Pipeline Banner */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-primary">
            🚀 3-Step Curriculum & Assignment Pipeline
          </h2>
          <span className="text-[10px] font-bold text-muted-foreground">Automated AI Spine</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="rounded-xl border border-border/80 bg-card p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold">1</span>
              <h3 className="text-xs font-bold text-foreground">Configure & Publish</h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Create the programme page, add modules/tracks, set fee & start date, and toggle Publish ON.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold">2</span>
              <h3 className="text-xs font-bold text-foreground">Generate Curriculum</h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Click <strong className="text-foreground">⚡ Prepare Teaching</strong> directly on any card below to build Week 1 plans, classwork & assignments.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold">3</span>
              <h3 className="text-xs font-bold text-foreground">Review & Assign</h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Review plans in <Link href="/dashboard/teaching/approvals" className="underline font-semibold text-primary">Teaching Approvals</Link>, then deliver activities & homework in the Classroom.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading programmes & teaching readiness…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <p className="font-bold text-foreground text-sm">No special programmes created yet.</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Click &quot;New special programme&quot; above to build your first programme page and curriculum spine.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((p) => {
            const isPrepBusy = preparingId === p.id;
            const cohortClass = p.cohort_class;
            const readiness = p.teaching_readiness;
            const canPrepare = readiness?.can_prepare ?? false;
            const missingSteps = readiness?.missing || [];
            const launchStatus = p.teaching_launch;

            return (
              <div
                key={p.id}
                className="border border-border rounded-2xl bg-card p-4 sm:p-5 space-y-4 shadow-sm hover:border-primary/40 transition-colors"
              >
                {/* Top Row: Title, Badges & Public Path */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-black text-base text-foreground truncate">{p.title}</h2>
                      {p.is_featured && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          ⭐ Featured
                        </span>
                      )}
                      <span
                        className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                          p.is_published
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {p.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                      {siteOrigin}{specialProgramPublicPath(p.slug)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyUrl(p.slug)}
                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg hover:bg-muted"
                    >
                      Copy Link
                    </button>
                    <Link
                      href={specialProgramPublicPath(p.slug)}
                      target="_blank"
                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border rounded-lg hover:bg-muted"
                    >
                      Preview Page ↗
                    </Link>
                    {!p.is_featured && (
                      <button
                        type="button"
                        onClick={() => setFeatured(p.id)}
                        className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-amber-500/40 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-500/10"
                      >
                        Set Featured
                      </button>
                    )}
                  </div>
                </div>

                {/* Program Details Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div className="bg-muted/30 p-2 rounded-lg border border-border/40">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block">Starts</span>
                    <span className="font-semibold text-foreground">{formatSpecialDate(p.starts_on)}</span>
                  </div>
                  <div className="bg-muted/30 p-2 rounded-lg border border-border/40">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block">Online Fee</span>
                    <span className="font-semibold text-foreground">₦{Number(p.online_fee || 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-muted/30 p-2 rounded-lg border border-border/40">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block">Onsite Fee</span>
                    <span className="font-semibold text-foreground">₦{Number(p.onsite_fee || 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-muted/30 p-2 rounded-lg border border-border/40">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground block">Modules / Weeks</span>
                    <span className="font-semibold text-foreground">{(p.content?.tracks || []).length} modules · {(p.content?.weeks || []).length} wks</span>
                  </div>
                </div>

                {/* Middle Row: Curriculum & Cohort Status Banner */}
                <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Curriculum & Cohort State
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {cohortClass ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Cohort Class: {cohortClass.name} ({cohortClass.status})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                          ⚠️ No Cohort Class Created (Will auto-create on Prepare)
                        </span>
                      )}

                      {canPrepare ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg">
                          ✓ Ready to Generate Curriculum
                        </span>
                      ) : missingSteps.length > 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          Setup needed: <span className="font-semibold text-foreground">{missingSteps.join(', ')}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {launchStatus && (
                    <div className="text-[11px] text-muted-foreground">
                      {launchStatus.status === 'ok' ? (
                        <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                          ✓ Last Prep: {launchStatus.built ?? 0} module(s), {launchStatus.weeks_started ?? 0} week pack(s) ready
                        </span>
                      ) : launchStatus.status === 'running' ? (
                        <span className="text-amber-700 dark:text-amber-300 font-medium animate-pulse">
                          ⚡ Teaching prep running...
                        </span>
                      ) : launchStatus.status === 'error' ? (
                        <span className="text-rose-700 dark:text-rose-300 font-medium">
                          ⚠️ Prep issue: {launchStatus.error || 'Check configuration'}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Bottom Row: Direct Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
                  <div className="flex flex-wrap gap-2">
                    {/* Primary Prepare Teaching Action */}
                    <button
                      type="button"
                      disabled={isPrepBusy}
                      onClick={() => void launchTeachingDirectly(p)}
                      className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5 shadow-sm"
                      title={
                        !canPrepare
                          ? `Missing: ${missingSteps.join(', ') || 'Setup parameters'}`
                          : 'Generate Week 1 curriculum, classwork & homework'
                      }
                    >
                      {isPrepBusy ? (
                        <>⚡ Generating Curriculum…</>
                      ) : (
                        <>⚡ Prepare Teaching</>
                      )}
                    </button>

                    {/* Re-sync / Rebuild Option if already prepared */}
                    {launchStatus?.status === 'ok' && (
                      <button
                        type="button"
                        disabled={isPrepBusy}
                        onClick={() => void launchTeachingDirectly(p, { forceRebuild: true })}
                        className="px-3.5 py-2 text-xs font-bold border border-border text-muted-foreground rounded-xl hover:bg-muted transition-colors"
                        title="Force rebuild curriculum from the page tracks"
                      >
                        🔄 Rebuild Spine
                      </button>
                    )}

                    {/* Direct Teaching Approvals Button */}
                    <Link
                      href="/dashboard/teaching/approvals"
                      className="px-3.5 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted transition-colors flex items-center gap-1.5"
                    >
                      📋 Teaching Approvals
                    </Link>

                    {/* Direct Open Classroom Button */}
                    {cohortClass?.id ? (
                      <Link
                        href={`/dashboard/classes/${cohortClass.id}`}
                        className="px-3.5 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted transition-colors flex items-center gap-1.5"
                      >
                        🏫 Open Classroom Workspace ↗
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="px-3.5 py-2 text-xs font-bold border border-border text-muted-foreground rounded-xl hover:bg-muted transition-colors"
                      >
                        + Create Cohort Class
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="px-3.5 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted transition-colors"
                    >
                      ✏️ Edit Page & Setup
                    </button>

                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="px-3 py-2 text-xs font-bold border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Visual Page Builder Modal */}
      {showBuilder && (
        <SpecialProgramVisualBuilder
          key={builderKey}
          editing={editing}
          initialForm={toSpecialForm(editing)}
          onClose={() => setShowBuilder(false)}
          onSaved={() => {
            setShowBuilder(false);
            load();
          }}
        />
      )}
    </div>
  );
}
