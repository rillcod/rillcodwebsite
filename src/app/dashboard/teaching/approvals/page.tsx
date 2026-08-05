"use client";

/**
 * This week's AI drafts, waiting for a teacher.
 *
 * The nightly job prepares a week and deliberately leaves it unpublished. Until
 * now there was nowhere to see that: the lesson existed as a draft, the
 * assignment sat inactive, and the only way to release them was to open each
 * one and publish it by hand. This is the one screen that says what is waiting
 * and lets a teacher release a whole week after reading it.
 *
 * Special programmes with multiple class meetings per week release one meeting
 * at a time (Week N · Class M) so Class 2 homework never goes live with Class 1.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import {
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  BookOpenIcon,
  PresentationChartLineIcon,
  ClipboardDocumentListIcon,
  RocketLaunchIcon,
  ArrowPathIcon,
  SparklesIcon,
  EyeIcon,
  XMarkIcon,
  AcademicCapIcon,
} from "@/lib/icons";
import {
  pendingWeekKey,
  type PendingApprovalItem,
  type PendingWeek,
} from "@/lib/academic/pending-approval";

function pendingKey(row: { planId: string; week: number; session?: number | null }) {
  return pendingWeekKey(row);
}

const ITEM_META: Record<
  PendingApprovalItem["kind"],
  { label: string; icon: React.ElementType; cls: string; href: (id: string) => string | null }
> = {
  lesson: {
    label: "Lesson",
    icon: BookOpenIcon,
    cls: "text-violet-600 dark:text-violet-400",
    href: (id) => `/dashboard/lessons/${id}`,
  },
  slides: {
    label: "Slides",
    icon: PresentationChartLineIcon,
    cls: "text-cyan-600 dark:text-cyan-400",
    href: (id) => `/dashboard/lessons/${id}?tab=materials#learning-slides`,
  },
  flashcards: {
    label: "Flashcards",
    icon: SparklesIcon,
    cls: "text-amber-600 dark:text-amber-400",
    href: (id) => `/dashboard/flashcards?deck_id=${id}`,
  },
  assignment: {
    label: "Assignment",
    icon: ClipboardDocumentListIcon,
    cls: "text-emerald-600 dark:text-emerald-400",
    href: (id) => `/dashboard/assignments/${id}`,
  },
  project: {
    label: "Project",
    icon: RocketLaunchIcon,
    cls: "text-purple-600 dark:text-purple-400",
    href: (id) => `/dashboard/assignments/${id}`,
  },
};

export default function ContentApprovalsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [weeks, setWeeks] = useState<PendingWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewWeek, setPreviewWeek] = useState<PendingWeek | null>(null);
  const [pathwayFilter, setPathwayFilter] = useState<'all' | 'special' | 'school'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teaching/pending-approval");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load the review queue");
      setWeeks(json.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const filteredWeeks = weeks.filter((w) => {
    if (pathwayFilter === 'special') return w.isSpecial;
    if (pathwayFilter === 'school') return !w.isSpecial;
    return true;
  });

  const specialCount = weeks.filter((w) => w.isSpecial).length;
  const schoolCount = weeks.filter((w) => !w.isSpecial).length;

  const toggleSelectAll = () => {
    if (selected.length === filteredWeeks.length) {
      setSelected([]);
    } else {
      setSelected(filteredWeeks.map(pendingKey));
    }
  };

  async function release(row: PendingWeek) {
    const key = pendingKey(row);
    setReleasing(key);
    try {
      const res = await fetch("/api/teaching/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: row.planId,
          week: row.week,
          ...(row.session != null && row.session > 0 ? { session: row.session } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not release this week");
      const result = json.data?.results?.[0] ?? json.data;
      const n =
        (result?.lessons_released ?? 0) +
        (result?.assignments_released ?? 0) +
        (result?.flashcards_released ?? 0);
      const meeting =
        row.session != null && row.session > 0
          ? `Week ${row.week} · Class ${row.session}`
          : `Week ${row.week}`;
      toast.success(`${meeting} released — ${n} item${n === 1 ? "" : "s"} now live`);
      setWeeks((prev) => prev.filter((w) => pendingKey(w) !== key));
      if (previewWeek && pendingKey(previewWeek) === key) {
        setPreviewWeek(null);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReleasing(null);
    }
  }

  async function releasePicks(picks: PendingWeek[]) {
    if (!picks.length) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/teaching/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releases: picks.map((w) => ({
            planId: w.planId,
            week: w.week,
            ...(w.session != null && w.session > 0 ? { session: w.session } : {}),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(json.error ?? "Bulk release failed");
      }
      const rows = (json.data?.results ?? []) as Array<{
        planId: string;
        week: number;
        session?: number | null;
        lessons_released: number;
        assignments_released: number;
        error?: string;
      }>;
      const ok = rows.filter((r) => !r.error);
      const failed = rows.filter((r) => r.error);
      if (ok.length) {
        const okSet = new Set(ok.map((r) => pendingKey(r)));
        setWeeks((prev) => prev.filter((w) => !okSet.has(pendingKey(w))));
      }
      setSelected([]);
      if (ok.length) toast.success(`Released ${ok.length} meeting${ok.length === 1 ? "" : "s"} to class`);
      if (failed.length) {
        toast.error(
          `${failed.length} meeting${failed.length === 1 ? "" : "s"} failed to release`
        );
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function releaseSelected() {
    const selectedSet = new Set(selected);
    const picks = filteredWeeks.filter((w) => selectedSet.has(pendingKey(w)));
    await releasePicks(picks);
  }

  async function releaseAll() {
    if (!confirm(`Release all ${filteredWeeks.length} pending draft meetings live to students?`)) return;
    await releasePicks(filteredWeeks);
  }

  const isStaff = profile?.role === "admin" || profile?.role === "teacher";

  if (authLoading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm font-black text-foreground">Teachers and admins only</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This page releases AI-prepared lessons to students.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
            <SparklesIcon className="h-3.5 w-3.5" />
            Teaching Engine & Approval Hub
          </p>
          <h1 className="mt-1 text-2xl font-black text-foreground">
            This week&apos;s AI teaching drafts
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Materials prepare automatically overnight and wait here. Review a meeting, preview its curriculum details & assignments, then release live to your classroom.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filteredWeeks.length > 0 && (
            <button
              onClick={() => void releaseAll()}
              disabled={loading || bulkBusy}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              🚀 Release All ({filteredWeeks.length})
            </button>
          )}
          <button
            onClick={() => void releaseSelected()}
            disabled={loading || bulkBusy || selected.length === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {bulkBusy ? (
              <>
                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                Releasing…
              </>
            ) : (
              <>Release selected ({selected.length})</>
            )}
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Pathway Filter Tabs & Selection Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex flex-wrap gap-1.5 bg-muted/30 p-1 rounded-xl border border-border/60">
          <button
            type="button"
            onClick={() => setPathwayFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              pathwayFilter === 'all'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Pending ({weeks.length})
          </button>
          <button
            type="button"
            onClick={() => setPathwayFilter('special')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
              pathwayFilter === 'special'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ✨ Special Programmes ({specialCount})
          </button>
          <button
            type="button"
            onClick={() => setPathwayFilter('school')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
              pathwayFilter === 'school'
                ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <AcademicCapIcon className="h-3.5 w-3.5" />
            Partner Schools ({schoolCount})
          </button>
        </div>

        {filteredWeeks.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            {selected.length === filteredWeeks.length ? "Deselect All" : `Select All (${filteredWeeks.length})`}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
          <p className="text-xs font-black text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      ) : filteredWeeks.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-2">
          <ClipboardDocumentCheckIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-black text-foreground">No draft meetings in this category</p>
          <p className="mx-auto max-w-md text-xs leading-5 text-muted-foreground">
            {weeks.length > 0
              ? 'Switch tabs above to view drafts in other learning pathways.'
              : 'Every prepared week has been released. New drafts appear here after the overnight run or when you prepare a Special Programme.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWeeks.map((row) => {
            const key = pendingKey(row);
            const busy = releasing === key;
            return (
              <div
                key={key}
                className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(key)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, key]
                            : prev.filter((k) => k !== key)
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-border"
                      aria-label={`Select week ${row.week}${row.session ? ` class ${row.session}` : ""}`}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.isSpecial ? (
                          <span className="rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                            ✨ Special Programme
                          </span>
                        ) : (
                          <span className="rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                            🏫 Partner School
                          </span>
                        )}

                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                          Week {row.week}
                          {row.session != null && row.session > 0
                            ? ` · Class ${row.session}`
                            : ""}
                        </span>
                        {row.className && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {row.className}
                          </span>
                        )}
                        {row.courseTitle && (
                          <span className="text-[10px] text-muted-foreground/70">
                            {row.courseTitle}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-black text-foreground">
                        {row.topic}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewWeek(previewWeek === row ? null : row)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[11px] font-bold hover:bg-muted"
                    >
                      <EyeIcon className="h-3.5 w-3.5" />
                      {previewWeek === row ? "Hide details" : "Curriculum preview"}
                    </button>

                    <button
                      onClick={() => void release(row)}
                      disabled={busy}
                      className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 shadow-sm"
                    >
                      {busy ? (
                        <>
                          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                          Releasing…
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          Release
                          {row.session != null && row.session > 0
                            ? " class"
                            : " week"}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Items strip */}
                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  {row.items.map((item) => {
                    const meta = ITEM_META[item.kind];
                    const Icon = meta.icon;
                    const href = meta.href(item.id);
                    const inner = (
                      <>
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.cls}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          {meta.label}
                        </span>
                        <span className="max-w-[220px] truncate text-[11px] text-foreground/80">
                          {item.title}
                        </span>
                      </>
                    );
                    return href ? (
                      <Link
                        key={`${item.kind}:${item.id}`}
                        href={href}
                        target="_blank"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 transition-colors hover:border-primary/40"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <span
                        key={`${item.kind}:${item.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5"
                      >
                        {inner}
                      </span>
                    );
                  })}
                </div>

                {/* Rich Curriculum Preview Drawer */}
                {previewWeek === row && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-xs mt-2 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <h4 className="font-black text-foreground flex items-center gap-2">
                        <EyeIcon className="h-4 w-4 text-primary" />
                        Full Curriculum Breakdown & Lesson Plan Preview
                      </h4>
                      <button
                        onClick={() => setPreviewWeek(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-2 bg-card p-3 rounded-xl border border-border/80">
                        <p className="font-bold text-foreground">📌 Meeting Identity</p>
                        <p><span className="text-muted-foreground">Topic:</span> <strong className="text-foreground">{row.topic}</strong></p>
                        <p><span className="text-muted-foreground">Classroom:</span> <strong className="text-foreground">{row.className || "Cohort Class"}</strong></p>
                        <p><span className="text-muted-foreground">Course:</span> <strong className="text-foreground">{row.courseTitle || "Syllabus Course"}</strong></p>
                        <p><span className="text-muted-foreground">Pathway:</span> {row.isSpecial ? "✨ Special Programme" : "🏫 Regular Partner School"}</p>
                      </div>

                      <div className="space-y-2 bg-card p-3 rounded-xl border border-border/80">
                        <p className="font-bold text-foreground">🎯 Objectives & Activities</p>
                        {row.objectives ? (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Objectives:</span>
                            <p className="text-xs leading-relaxed text-foreground">
                              {Array.isArray(row.objectives) ? row.objectives.join(' · ') : String(row.objectives)}
                            </p>
                          </div>
                        ) : null}
                        {row.classwork ? (
                          <div className="pt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Classwork:</span>
                            <p className="text-xs text-foreground font-semibold">{row.classwork}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        {row.items.map((it) => (
                          <div key={it.id} className="bg-card border border-border px-3 py-1.5 rounded-lg text-xs font-semibold">
                            {ITEM_META[it.kind]?.label}: {it.title}
                          </div>
                        ))}
                      </div>

                      {row.classId && (
                        <Link
                          href={`/dashboard/classes/${row.classId}`}
                          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:opacity-90 transition-opacity"
                        >
                          Open Classroom Workspace ↗
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
