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
 * Special programmes with multiple teaching sessions per week release one session
 * at a time (Week N · Session M) so Session 2 homework never goes live with Session 1.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
  MagnifyingGlassIcon,
  BoltIcon,
  ChevronDownIcon,
} from "@/lib/icons";
import {
  pendingWeekKey,
  type PendingApprovalItem,
  type PendingWeek,
} from "@/lib/academic/pending-approval";
import { teachingMeetingLabel } from "@/lib/academic/session-identity";
import { requestTrackedWeekGeneration } from "@/lib/academic/week-generation-client";
import type { WeekContentType } from "@/lib/academic/auto-generate-settings";
import { ApprovalGateNav } from "@/components/academic/ApprovalGateNav";
import { ConfirmModal } from "@/components/ui/Modal";

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
    href: (id) => `/dashboard/flashcards?deckId=${id}`,
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
    href: (id) => `/dashboard/projects/${id}`,
  },
};

const GENERATION_TYPE: Record<PendingApprovalItem["kind"], WeekContentType> = {
  lesson: "lessons",
  slides: "slides",
  flashcards: "flashcards",
  assignment: "assignments",
  project: "projects",
};

export default function ContentApprovalsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [weeks, setWeeks] = useState<PendingWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewWeek, setPreviewWeek] = useState<PendingWeek | null>(null);
  const [pathwayFilter, setPathwayFilter] = useState<'all' | 'special' | 'school'>('all');
  const [readinessFilter, setReadinessFilter] = useState<'all' | 'ready' | 'repair'>('ready');
  const [query, setQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(12);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    confirmText: string;
    variant: "success" | "warning";
    run: () => Promise<void>;
  } | null>(null);

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

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const week = Number(params.get("week"));
    const session = Number(params.get("session") || 1);
    const planId = params.get("plan");
    if (!Number.isFinite(week) || week < 1) return;
    const match = weeks.find((row) => {
      if (planId && row.planId !== planId) return false;
      return row.week === week && row.session === (Number.isFinite(session) && session > 0 ? session : 1);
    });
    if (!match) return;
    const key = pendingKey(match);
    setFocusKey(key);
    const el = document.getElementById(`approval-${key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, weeks]);

  const filteredWeeks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return weeks.filter((week) => {
      if (pathwayFilter === 'special' && !week.isSpecial) return false;
      if (pathwayFilter === 'school' && week.isSpecial) return false;
      if (readinessFilter === 'ready' && !week.complete) return false;
      if (readinessFilter === 'repair' && week.complete) return false;
      if (!needle) return true;
      return [week.className, week.courseTitle, week.topic]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [pathwayFilter, query, readinessFilter, weeks]);

  const specialCount = weeks.filter((w) => w.isSpecial).length;
  const schoolCount = weeks.filter((w) => !w.isSpecial).length;
  const readyWeeks = filteredWeeks.filter((week) => week.complete);
  const repairCount = weeks.filter((week) => !week.complete).length;
  const readyCount = weeks.length - repairCount;
  const displayedWeeks = filteredWeeks.slice(0, visibleLimit);
  const filteredPlanIds = [...new Set(filteredWeeks.map((week) => week.planId))];
  const allPlanIds = [...new Set(weeks.map((week) => week.planId))];
  const automaticPlanIds = [...new Set(
    weeks.filter((week) => week.autoPublish).map((week) => week.planId),
  )];

  useEffect(() => {
    setVisibleLimit(12);
  }, [pathwayFilter, query, readinessFilter]);

  const toggleSelectAll = () => {
    if (selected.length === readyWeeks.length) {
      setSelected([]);
    } else {
      setSelected(readyWeeks.map(pendingKey));
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
          session: row.session,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not share this week");
      const result = json.data?.results?.[0] ?? json.data;
      const n =
        (result?.lessons_released ?? 0) +
        (result?.assignments_released ?? 0) +
        (result?.slides_released ?? 0) +
        (result?.flashcards_released ?? 0);
      const meeting = teachingMeetingLabel(row.week, row.session, row.meetingsInWeek);
      const warning = result?.warning ?? json.warning;
      if (warning) {
        toast.warning(`${meeting} is live. ${warning}`);
      } else {
        toast.success(`${meeting} shared — ${n} item${n === 1 ? "" : "s"} now visible`);
      }
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

  async function prepareMissing(row: PendingWeek) {
    if (!row.missingKinds.length) return;
    const key = pendingKey(row);
    setPreparing(key);
    try {
      const json = await requestTrackedWeekGeneration({
        planId: row.planId,
        week: row.week,
        session: row.session,
        types: row.missingKinds.map((kind) => GENERATION_TYPE[kind]),
      });
      if (!json.success) {
        throw new Error(json.error ?? "Could not prepare the missing items");
      }
      if (json.alreadyRunning === true) {
        toast.info("This meeting is already being prepared. A second run was not started.");
      } else if (Array.isArray(json.failedTypes) && json.failedTypes.length > 0) {
        toast.warning("Some items still need a retry. Completed items were kept.");
      } else {
        toast.success("Missing items prepared. Review them before sharing.");
      }
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare the missing items");
    } finally {
      setPreparing(null);
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
            session: w.session,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(json.error ?? "Could not share the selected meetings");
      }
      const rows = (json.data?.results ?? []) as Array<{
        planId: string;
        week: number;
        session?: number | null;
        lessons_released: number;
        assignments_released: number;
        warning?: string;
        error?: string;
      }>;
      const ok = rows.filter((r) => !r.error);
      const failed = rows.filter((r) => r.error);
      if (ok.length) {
        const okSet = new Set(ok.map((r) => pendingKey(r)));
        setWeeks((prev) => prev.filter((w) => !okSet.has(pendingKey(w))));
      }
      setSelected([]);
      const alertWarnings = ok.filter((row) => row.warning);
      if (ok.length && alertWarnings.length === 0) {
        toast.success(`Shared ${ok.length} meeting${ok.length === 1 ? "" : "s"} with students`);
      }
      if (alertWarnings.length > 0) {
        toast.warning(json.warning ?? `${alertWarnings.length} live meeting${alertWarnings.length === 1 ? " did" : "s did"} not send every student alert. An administrator can resend them from Office.`);
      }
      if (failed.length) {
        toast.error(
          `${failed.length} meeting${failed.length === 1 ? "" : "s"} could not be shared`
        );
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  function releaseSelected() {
    const selectedSet = new Set(selected);
    const picks = readyWeeks.filter((w) => selectedSet.has(pendingKey(w)));
    if (!picks.length) return;
    setConfirmation({
      title: `Share ${picks.length} selected package${picks.length === 1 ? "" : "s"}?`,
      message: "Students will receive the lesson, slides, practice cards, assignment and project prepared for each selected class meeting. Assessments remain private.",
      confirmText: "Share selected",
      variant: "success",
      run: () => releasePicks(picks),
    });
  }

  function releaseAll() {
    if (!readyWeeks.length) return;
    setConfirmation({
      title: `Share all ${readyWeeks.length} ready package${readyWeeks.length === 1 ? "" : "s"}?`,
      message: "Every complete package in the current filter will become visible to its class. Saved scores, submissions and attendance are not changed.",
      confirmText: "Share all ready",
      variant: "success",
      run: () => releasePicks(readyWeeks),
    });
  }

  function requestRelease(row: PendingWeek, availableOnly = false) {
    const meeting = teachingMeetingLabel(row.week, row.session, row.meetingsInWeek);
    setConfirmation({
      title: availableOnly
        ? `Share the available items for ${meeting}?`
        : `Share ${meeting} with students?`,
      message: availableOnly
        ? `${row.className || "This class"} will receive ${row.items.length} prepared item${row.items.length === 1 ? "" : "s"}. ${row.missingKinds.length} missing item${row.missingKinds.length === 1 ? " remains" : "s remain"} unavailable until prepared.`
        : `${row.className || "This class"} will receive the complete package for “${row.topic}”. Assessments remain private until opened separately.`,
      confirmText: availableOnly ? "Share available items" : "Share with students",
      variant: availableOnly ? "warning" : "success",
      run: () => release(row),
    });
  }

  async function saveAutomaticDelivery(autoPublish: boolean) {
    const planIds = filteredPlanIds.length ? filteredPlanIds : allPlanIds;
    if (!planIds.length) return;
    setAutomationBusy(true);
    try {
      const response = await fetch("/api/teaching/pending-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_auto_delivery",
          auto_publish: autoPublish,
          plan_ids: planIds,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) {
        throw new Error(json.error ?? "Could not update delivery automation");
      }
      const updated = Number(json.data?.updated) || 0;
      const failed = Array.isArray(json.data?.failures)
        ? json.data.failures.length
        : 0;
      toast[failed ? "warning" : "success"](
        autoPublish
          ? `${updated} class plan${updated === 1 ? " will" : "s will"} now share complete future packages automatically.`
          : `${updated} class plan${updated === 1 ? " now requires" : "s now require"} review before sharing.`,
      );
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not update delivery automation",
      );
    } finally {
      setAutomationBusy(false);
    }
  }

  function requestAutomaticDelivery(autoPublish: boolean) {
    const planCount = filteredPlanIds.length || allPlanIds.length;
    if (!planCount) return;
    setConfirmation({
      title: autoPublish
        ? `Turn on automatic delivery for ${planCount} class plan${planCount === 1 ? "" : "s"}?`
        : `Require review for ${planCount} class plan${planCount === 1 ? "" : "s"}?`,
      message: autoPublish
        ? "Only complete five-item packages will be shared. Existing teacher edits stay unchanged. Packages already waiting here remain held until you share them; future complete packages will go directly to learners."
        : "Future packages will stay in this queue until a teacher reviews and shares them. Work already visible to learners is not withdrawn.",
      confirmText: autoPublish ? "Turn on auto-delivery" : "Require review",
      variant: autoPublish ? "warning" : "success",
      run: () => saveAutomaticDelivery(autoPublish),
    });
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
            Teaching review
          </p>
          <h1 className="mt-1 text-2xl font-black text-foreground">
            Teaching packages
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Share complete class packages, or repair only what is missing. Saved teacher work is never regenerated here.
          </p>
          <div className="mt-3">
            <ApprovalGateNav current="weeks" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readyWeeks.length > 0 && (
            <button
              onClick={() => void releaseAll()}
              disabled={loading || bulkBusy}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
            >
              Share all ready ({readyWeeks.length})
            </button>
          )}
          {selected.length > 0 && (
            <button
              onClick={releaseSelected}
              disabled={loading || bulkBusy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-[11px] font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
            >
              Share selected ({selected.length})
            </button>
          )}
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

      {!loading && weeks.length > 0 && (
        <section className="grid grid-cols-3 gap-2" aria-label="Teaching delivery summary">
          <button
            type="button"
            onClick={() => setReadinessFilter("ready")}
            className={`rounded-2xl border p-3 text-left transition-colors ${
              readinessFilter === "ready"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-border bg-card hover:border-emerald-500/30"
            }`}
          >
            <span className="block text-xl font-black tabular-nums text-foreground">{readyCount}</span>
            <span className="mt-0.5 block text-[10px] font-bold text-muted-foreground">Ready to share</span>
          </button>
          <button
            type="button"
            onClick={() => setReadinessFilter("repair")}
            className={`rounded-2xl border p-3 text-left transition-colors ${
              readinessFilter === "repair"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border bg-card hover:border-amber-500/30"
            }`}
          >
            <span className="block text-xl font-black tabular-nums text-foreground">{repairCount}</span>
            <span className="mt-0.5 block text-[10px] font-bold text-muted-foreground">Need repair</span>
          </button>
          <button
            type="button"
            onClick={() => setReadinessFilter("all")}
            className={`rounded-2xl border p-3 text-left transition-colors ${
              readinessFilter === "all"
                ? "border-primary/40 bg-primary/10"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <span className="block text-xl font-black tabular-nums text-foreground">{allPlanIds.length}</span>
            <span className="mt-0.5 block text-[10px] font-bold text-muted-foreground">Class plans</span>
          </button>
        </section>
      )}

      {!loading && allPlanIds.length > 0 && (
        <details className="group rounded-2xl border border-border bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BoltIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-foreground">Delivery automation</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                {automaticPlanIds.length > 0
                  ? `${automaticPlanIds.length} of ${allPlanIds.length} class plans auto-share complete future packages.`
                  : "All class plans currently wait for a teacher before learners can see them."}
              </span>
            </span>
            <span className="text-[10px] font-bold text-muted-foreground group-open:hidden">Manage</span>
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border px-4 py-4">
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              The assistant reuses approved content first, fills only genuine gaps, and shares only after all five learning items are complete. Existing teacher edits are protected.
            </p>
            {profile.role === "admin" ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => requestAutomaticDelivery(true)}
                  disabled={automationBusy}
                  className="min-h-11 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground disabled:opacity-50"
                >
                  Auto-share future complete packages
                </button>
                <button
                  type="button"
                  onClick={() => requestAutomaticDelivery(false)}
                  disabled={automationBusy}
                  className="min-h-11 rounded-xl border border-border px-4 text-xs font-black text-foreground disabled:opacity-50"
                >
                  Require teacher review
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs font-semibold text-foreground">
                The Academic Office controls automatic learner delivery. You can still review and share any ready package below.
              </p>
            )}
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              These controls apply to class plans in the current pathway and search filter. They never delete work, withdraw published items, or change scores.
            </p>
          </div>
        </details>
      )}

      {/* Pathway Filter Tabs & Selection Strip */}
      <div className="space-y-3 border-b border-border/60 pb-3">
        <label className="relative block">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a class, course or topic"
            className="min-h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
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

        {readyWeeks.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            {selected.length === readyWeeks.length ? "Deselect all" : `Select ready (${readyWeeks.length})`}
          </button>
        )}
        </div>
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
          {displayedWeeks.map((row) => {
            const key = pendingKey(row);
            const busy = releasing === key;
            const preparingThis = preparing === key;
            return (
              <div
                key={key}
                id={`approval-${key}`}
                className={`rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30 space-y-3 ${
                  focusKey === key
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(key)}
                      disabled={!row.complete}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, key]
                            : prev.filter((k) => k !== key)
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-border disabled:opacity-40"
                      aria-label={`Select ${teachingMeetingLabel(row.week, row.session, row.meetingsInWeek)}`}
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
                          {teachingMeetingLabel(row.week, row.session, row.meetingsInWeek)}
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
                      {previewWeek === row ? "Hide review" : "Review"}
                    </button>

                    {row.complete ? (
                      <button
                        onClick={() => requestRelease(row)}
                        disabled={busy}
                        className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-800 disabled:opacity-50 shadow-sm"
                      >
                        {busy ? (
                          <>
                            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                            Sharing…
                          </>
                        ) : (
                          <>
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                            Review & share
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => void prepareMissing(row)}
                        disabled={preparingThis}
                        className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-violet-700 px-4 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-violet-800 disabled:opacity-50 shadow-sm"
                      >
                        {preparingThis ? (
                        <>
                          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                          Preparing…
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="h-3.5 w-3.5" />
                          Prepare {row.missingKinds.length} missing
                        </>
                      )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
                  {row.items.map((item) => {
                    const meta = ITEM_META[item.kind];
                    const Icon = meta.icon;
                    return (
                      <span
                        key={`${item.kind}:${item.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1"
                        title={`${meta.label}: ${item.title}`}
                      >
                        <Icon className={`h-3 w-3 ${meta.cls}`} />
                        {meta.label}
                      </span>
                    );
                  })}
                  <span className="ml-auto font-semibold">
                    {row.complete ? "5 of 5 ready" : `${row.items.length} of 5 ready`}
                  </span>
                </div>

                {/* Rich Curriculum Preview Drawer */}
                {previewWeek === row && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-xs mt-2 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <h4 className="font-black text-foreground flex items-center gap-2">
                        <EyeIcon className="h-4 w-4 text-primary" />
                        {teachingMeetingLabel(row.week, row.session, row.meetingsInWeek)} package review
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
                        <p className="font-bold text-foreground">Meeting</p>
                        <p><span className="text-muted-foreground">Topic:</span> <strong className="text-foreground">{row.topic}</strong></p>
                        <p><span className="text-muted-foreground">Class:</span> <strong className="text-foreground">{row.className || "Cohort class"}</strong></p>
                        <p><span className="text-muted-foreground">Course:</span> <strong className="text-foreground">{row.courseTitle || "Course"}</strong></p>
                        <p><span className="text-muted-foreground">Programme:</span> {row.isSpecial ? "Special programme" : "Partner school"}</p>
                      </div>

                      <div className="space-y-2 bg-card p-3 rounded-xl border border-border/80">
                        <p className="font-bold text-foreground">Teaching direction</p>
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

                    {row.missingKinds.length > 0 && (
                      <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-foreground">
                          <strong>{row.missingKinds.length} item{row.missingKinds.length === 1 ? " is" : "s are"} missing:</strong>{" "}
                          {row.missingKinds.map((kind) => ITEM_META[kind].label).join(", ")}.
                          Prepare only these items, or deliberately share the available work.
                        </p>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void prepareMissing(row)}
                            disabled={preparingThis}
                            className="rounded-lg bg-violet-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                          >
                            Prepare missing
                          </button>
                          <button
                            type="button"
                            onClick={() => requestRelease(row, true)}
                            disabled={busy}
                            className="rounded-lg border border-amber-500/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-200 disabled:opacity-50"
                          >
                            Share available only
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        {row.items.map((it) => (
                          <div key={it.id} className="bg-card border border-border px-3 py-1.5 rounded-lg text-xs font-semibold">
                            {ITEM_META[it.kind]?.label}: {it.title} · {it.state === "live" ? "Visible" : "Needs review"}
                          </div>
                        ))}
                      </div>

                      {row.classId && (
                        <Link
                          href={`/dashboard/classes/${row.classId}`}
                          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:opacity-90 transition-opacity"
                        >
                          Open class plan
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {displayedWeeks.length < filteredWeeks.length && (
            <button
              type="button"
              onClick={() => setVisibleLimit((current) => current + 12)}
              className="min-h-11 w-full rounded-xl border border-border bg-card text-xs font-black text-foreground transition-colors hover:border-primary/40"
            >
              Show 12 more · {filteredWeeks.length - displayedWeeks.length} remaining
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        onConfirm={async () => {
          if (confirmation) await confirmation.run();
        }}
        busy={Boolean(releasing || bulkBusy)}
        title={confirmation?.title ?? "Confirm sharing"}
        message={confirmation?.message ?? ""}
        confirmText={confirmation?.confirmText ?? "Confirm"}
        confirmingText="Sharing…"
        variant={confirmation?.variant ?? "success"}
      />
    </div>
  );
}
