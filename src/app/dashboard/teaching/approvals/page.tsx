"use client";

/**
 * This week's AI drafts, waiting for a teacher.
 *
 * The nightly job prepares a week and deliberately leaves it unpublished. Until
 * now there was nowhere to see that: the lesson existed as a draft, the
 * assignment sat inactive, and the only way to release them was to open each
 * one and publish it by hand. This is the one screen that says what is waiting
 * and lets a teacher release a whole week after reading it.
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
} from "@/lib/icons";

type PendingItem = {
  kind: "lesson" | "slides" | "assignment" | "project" | "flashcards";
  id: string;
  title: string;
};

type PendingWeek = {
  planId: string;
  className: string | null;
  courseTitle: string | null;
  week: number;
  topic: string;
  items: PendingItem[];
};

const ITEM_META: Record<
  PendingItem["kind"],
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
    // id is the lesson id — opens the materials / slides tab
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

  async function release(row: PendingWeek) {
    const key = `${row.planId}:${row.week}`;
    setReleasing(key);
    try {
      const res = await fetch("/api/teaching/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: row.planId, week: row.week }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not release this week");
      const result = json.data?.results?.[0] ?? json.data;
      const n =
        (result?.lessons_released ?? 0) +
        (result?.assignments_released ?? 0) +
        (result?.flashcards_released ?? 0);
      toast.success(`Week ${row.week} released — ${n} item${n === 1 ? "" : "s"} now live`);
      setWeeks((prev) =>
        prev.filter((w) => !(w.planId === row.planId && w.week === row.week))
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReleasing(null);
    }
  }

  async function releaseSelected() {
    if (!selected.length) return;
    setBulkBusy(true);
    try {
      const selectedSet = new Set(selected);
      const picks = weeks.filter((w) => selectedSet.has(`${w.planId}:${w.week}`));
      const res = await fetch("/api/teaching/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releases: picks.map((w) => ({ planId: w.planId, week: w.week })),
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(json.error ?? "Bulk release failed");
      }
      const rows = (json.data?.results ?? []) as Array<{
        planId: string;
        week: number;
        lessons_released: number;
        assignments_released: number;
        error?: string;
      }>;
      const ok = rows.filter((r) => !r.error);
      const failed = rows.filter((r) => r.error);
      if (ok.length) {
        const okSet = new Set(ok.map((r) => `${r.planId}:${r.week}`));
        setWeeks((prev) => prev.filter((w) => !okSet.has(`${w.planId}:${w.week}`)));
      }
      setSelected([]);
      if (ok.length) toast.success(`Released ${ok.length} week${ok.length === 1 ? "" : "s"}`);
      if (failed.length) {
        toast.error(
          `${failed.length} week${failed.length === 1 ? "" : "s"} failed to release`
        );
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkBusy(false);
    }
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
            <SparklesIcon className="h-3.5 w-3.5" />
            Prepared for you
          </p>
          <h1 className="mt-1 text-2xl font-black text-foreground">
            This week&apos;s drafts
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            We prepare materials overnight and hold them here. Read a week, then
            release it — students see nothing until you do.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void releaseSelected()}
            disabled={loading || bulkBusy || selected.length === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {bulkBusy ? (
              <>
                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                Releasing…
              </>
            ) : (
              <>Release to class ({selected.length})</>
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

      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
          <p className="text-xs font-black text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      ) : weeks.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ClipboardDocumentCheckIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-black text-foreground">Nothing waiting</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
            Every prepared week has been released. New drafts appear here after the
            overnight run, or as soon as you generate a week yourself.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {weeks.map((row) => {
            const key = `${row.planId}:${row.week}`;
            const busy = releasing === key;
            return (
              <div
                key={key}
                className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
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
                      aria-label={`Select week ${row.week}`}
                    />
                    <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                        Week {row.week}
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

                  <button
                    onClick={() => void release(row)}
                    disabled={busy}
                    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy ? (
                      <>
                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                        Releasing…
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        Release week
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
