"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowPathIcon,
  BookOpenIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentChartBarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlayIcon,
  PresentationChartLineIcon,
  RocketLaunchIcon,
  SparklesIcon,
  VideoCameraIcon,
  XMarkIcon,
  BoltIcon,
  ClipboardDocumentListIcon,
} from "@/lib/icons";
import type { StageStatus } from "@/lib/academic/status";
import { validateLessonPlanForGeneration } from "@/lib/api-guards";
import {
  buildAssignmentNewHref,
  buildClassAssessmentHref,
  buildCbtNewHref,
  buildCurriculumHref,
  buildFlashcardsHref,
  buildGradesHref,
  buildLessonNewHref,
  buildLessonPlanHref,
  buildLessonSlidesHref,
  buildProjectNewHref,
  buildResultsHref,
} from "@/lib/curriculum/href";
import {
  weekSessionLookupKey,
  type AssetVisibility,
} from "@/lib/academic/week-package";
import {
  buildTeachingWeekRows,
  teachingSlotNeedsAttention,
} from "@/lib/academic/teaching-workspace";
import { createClient } from "@/lib/supabase/client";
import { SmartCourseSelect } from "@/components/courses/SmartCourseSelect";
import PipelineStepper from "@/components/pipeline/PipelineStepper";
import WeekAIGenerator from "@/components/ai/WeekAIGenerator";

type Props = {
  classId: string;
  initialCourseId?: string | null;
  canEdit: boolean;
  onCourseChange?: (id: string | null) => Promise<void> | void;
  onCoverageChange?: (coverage: {
    delivered: number;
    planned: number;
  }) => void;
};

export function ClassTeachingWorkspace({
  classId,
  initialCourseId,
  canEdit,
  onCourseChange,
  onCoverageChange,
}: Props) {
  const [data, setData] = useState<any>(null);
  const [courseId, setCourseId] = useState(initialCourseId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<{
    href: string;
    label: string;
  } | null>(null);

  const planStage = (data?.plan_stage ?? null) as StageStatus | null;

  // Keep the full week+meeting identity so multi-session weeks never collapse.
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Filter & Search controls
  const [weekFilter, setWeekFilter] = useState<"all" | "todo" | "taught">("all");
  const [termFilter, setTermFilter] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");

  // Detailed drawer toggles per week
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // AI Generation state
  const [aiBusy, setAiBusy] = useState(false);
  const [aiWeek, setAiWeek] = useState<{
    week: number;
    session?: number | null;
    topic: string;
    objectives?: string;
    activities?: string;
    notes?: string;
    assignment?: { title?: string; brief?: string };
    project?: { title?: string; description?: string };
  } | null>(null);
  const [pendingRelease, setPendingRelease] = useState<{
    label: string;
    body: Record<string, unknown>;
  } | null>(null);

  // Guard against race conditions when switching courses rapidly
  const loadSeq = useRef(0);

  const load = useCallback(
    async (cid?: string) => {
      const seq = ++loadSeq.current;
      setBusy(true);
      setError("");
      setErrorAction(null);
      try {
        const q = cid ? `?course_id=${encodeURIComponent(cid)}` : "";
        const r = await fetch(`/api/classes/${classId}/teaching-workspace${q}`);
        const j = await r.json();
        if (seq !== loadSeq.current) return;
        if (!r.ok)
          throw new Error(j.error || "Unable to load teaching workspace");
        setData(j.data);
        if (j.data.coverage) onCoverageChange?.(j.data.coverage);
        const resolvedId = j.data.selected_course_id || "";
        setCourseId(resolvedId);
        if (resolvedId && typeof window !== "undefined") {
          const url = new URL(window.location.href);
          if (url.searchParams.get("course_id") !== resolvedId) {
            url.searchParams.set("course_id", resolvedId);
            window.history.replaceState(null, "", url.toString());
          }
        }
      } catch (e: any) {
        if (seq === loadSeq.current) setError(e.message);
      } finally {
        if (seq === loadSeq.current) setBusy(false);
      }
    },
    [classId, onCoverageChange]
  );

  useEffect(() => {
    void load(initialCourseId || undefined);
  }, [load, initialCourseId]);

  useEffect(() => {
    setPicked(new Set());
  }, [courseId, data?.plan?.id]);

  useEffect(() => {
    const planId = data?.plan?.id;
    if (!planId) return;
    const db = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(courseId), 250);
    };
    const channel = db
      .channel(`teaching_workspace_${planId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_lesson_delivery",
          filter: `lesson_plan_id=eq.${planId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "curriculum_week_tracking",
          filter: `lesson_plan_id=eq.${planId}`,
        },
        refresh
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [courseId, data?.plan?.id, load]);

  async function chooseCourse(id: string) {
    setCourseId(id);
    if (id && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("course_id", id);
      window.history.replaceState(null, "", url.toString());
    }
    await onCourseChange?.(id || null);
    await load(id || undefined);
  }

  async function act(body: any): Promise<boolean> {
    setBusy(true);
    setError("");
    setErrorAction(null);
    try {
      const r = await fetch(`/api/classes/${classId}/teaching-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.action_href && j.action_label) {
          setErrorAction({ href: j.action_href, label: j.action_label });
        }
        throw new Error(j.detail || j.error || "Action failed");
      }
      await load(courseId);
      if (j.warning) setError(j.warning);
      return true;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
      return false;
    }
  }

  async function createFlashcardDeck(item: any, week: number) {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const title = `${item.title || item.topic || `Week ${week}`} Flashcards`;
      const r = await fetch("/api/flashcards/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          lesson_id: item.id || null,
          course_id: courseId,
          school_id: data?.class?.school_id,
          class_id: classId,
          lesson_plan_id: plan.id,
          curriculum_week_number: week,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to create flashcards");
      window.location.href = buildFlashcardsHref({
        deckId: j.data.id,
        classId,
        courseId,
        lessonId: item.id || null,
        lessonPlanId: plan.id,
        topic: item.title || item.topic || title,
        autoGenerate: true,
      });
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function generateLessonsWithAi() {
    if (!plan) return;
    setAiBusy(true);
    setError("");
    setErrorAction(null);
    try {
      const r = await fetch(`/api/lesson-plans/${plan.id}/generate-lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.action_href && j.action_label) {
          setErrorAction({ href: j.action_href, label: j.action_label });
        }
        throw new Error(
          [j.error, j.detail].filter(Boolean).join(" — ") ||
            "AI could not generate lessons"
        );
      }
      await load(courseId);
    } catch (e: any) {
      setError(e.message || "AI generate failed");
    } finally {
      setAiBusy(false);
    }
  }

  const plan = data?.plan;
  const progress = data?.progress;
  const planBlock = plan ? validateLessonPlanForGeneration(plan) : null;
  const planReady = Boolean(plan) && planBlock === null;

  async function confirmPendingRelease() {
    if (!pendingRelease) return;
    const body = pendingRelease.body;
    setPendingRelease(null);
    const ok = await act(body);
    if (ok) setPicked(new Set());
  }

  const officialDirection = data?.academic_direction?.available
    ? data.academic_direction.title
    : null;

  const selectedCourse = (data?.courses || []).find(
    (course: any) => course.id === courseId
  );

  // Join each plan week to this class's lesson, decks, homework, project and
  // evaluation — the same week+session lookup the workspace has always used.
  const weekRows = useMemo(() => {
    const assembled = buildTeachingWeekRows({
      planWeeks: Array.isArray(plan?.plan_data?.weeks)
        ? plan.plan_data.weeks
        : [],
      lessons: data?.lessons,
      assignments: data?.assignments,
      projects: data?.projects,
      slideDecks: data?.slide_decks,
      flashcardDecks: data?.flashcard_decks,
      exams: data?.exams,
      deliveries: data?.deliveries,
    });
    return assembled.map((row) => {
      const {
        weekMeta,
        week,
        session,
        lesson,
        topic,
        objectives,
        activities,
      } = row;
      const manualLessonHref = buildLessonNewHref({
        classId,
        courseId,
        programId: data?.class?.program_id,
        lessonPlanId: plan?.id ?? null,
        curriculumId: plan?.curriculum_version_id ?? null,
        week,
        topic,
        subject: selectedCourse?.title,
        description: [objectives, activities].filter(Boolean).join("\n\n"),
        notes: weekMeta.notes,
        plan: {
          objectives: objectives
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          student_activities: activities
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          assignment: weekMeta.assignment,
          project: weekMeta.project,
        },
      });
      const liveSessionHref = `/dashboard/live-sessions?create=1&title=${encodeURIComponent(
        `Week ${week}: ${topic}`
      )}&notes=${encodeURIComponent(
        JSON.stringify({
          class_id: classId,
          course_id: courseId,
          lesson_plan_id: plan?.id ?? null,
          week,
          session,
          lesson_id: lesson?.id ?? null,
        })
      )}`;
      return {
        ...row,
        manualLessonHref,
        liveSessionHref,
      };
    });
  }, [
    plan?.plan_data?.weeks,
    plan?.id,
    plan?.curriculum_version_id,
    data?.lessons,
    data?.assignments,
    data?.projects,
    data?.slide_decks,
    data?.flashcard_decks,
    data?.exams,
    data?.deliveries,
    data?.class?.program_id,
    classId,
    courseId,
    selectedCourse?.title,
  ]);

  const weeksNeedingWork = weekRows.filter(teachingSlotNeedsAttention).length;
  const weeksTaught = weekRows.filter((row) => row.taught).length;
  const weeksFullyLive = weekRows.filter(
    (row) => row.visibilitySummary.fullyLive
  ).length;

  const termsPresent = useMemo(
    () =>
      [
        ...new Set(
          weekRows
            .map((row) => row.term)
            .filter((term): term is number => term !== null)
        ),
      ].sort((a, b) => a - b),
    [weekRows]
  );

  const offering = data?.class?.academic_offerings;
  const isSpecialProgram = Boolean(
    (offering?.enrollment_type && offering.enrollment_type !== "school") ||
      (!data?.class?.term_id && data?.class?.academic_offering_id)
  );

  const visibleWeekRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return weekRows.filter((row) => {
      const matchesStatus =
        weekFilter === "todo"
          ? teachingSlotNeedsAttention(row)
          : weekFilter === "taught"
          ? row.taught
          : true;
      const matchesTerm =
        isSpecialProgram ||
        termFilter === 0 ||
        row.term === null ||
        row.term === termFilter;
      const matchesQuery =
        !query ||
        row.topic.toLowerCase().includes(query) ||
        row.objectives.toLowerCase().includes(query) ||
        row.activities.toLowerCase().includes(query) ||
        `week ${row.week}`.includes(query) ||
        `w${row.week}`.includes(query);

      return matchesStatus && matchesTerm && matchesQuery;
    });
  }, [weekRows, weekFilter, termFilter, isSpecialProgram, searchQuery]);

  const pickedRows = useMemo(
    () => weekRows.filter((row) => picked.has(row.rowKey)),
    [weekRows, picked]
  );

  // The active focus week that needs preparation or release
  const resumeWeek = weekRows.find(teachingSlotNeedsAttention) ||
    weekRows.find((row) => !row.taught);

  function toggleCardExpanded(rowKey: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }

  function scrollToWeek(rowKey: string) {
    const el = document.getElementById(`week-card-${rowKey}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "transition-all");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1800);
    }
  }

  return (
    <div className="space-y-4">
      {courseId && (
        <PipelineStepper
          current="plans"
          courseId={courseId}
          programId={data?.class?.program_id}
          classId={classId}
          lessonPlanId={plan?.id}
          courseTitle={
            (data?.courses || []).find((c: any) => c.id === courseId)?.title
          }
        />
      )}

      {isSpecialProgram && data?.class?.academic_offerings ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-lg text-amber-600 dark:text-amber-300">
              ✨
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                  Special Programme Cohort Workspace
                </span>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-200">
                  {data.class.academic_offerings.enrollment_type || "Special"}
                </span>
              </div>
              <p className="mt-0.5 text-sm font-black text-foreground">
                {data.class.academic_offerings.title || data.class.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/special-programs"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-800 hover:underline dark:text-amber-200"
            >
              Special Programmes Manager ↗
            </Link>
          </div>
        </div>
      ) : null}

      {/* Course & Official Direction Header */}
      <div className="rounded-2xl border border-border/80 bg-card/60 p-3.5 sm:p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <SmartCourseSelect
              label="Active Course"
              labelClass="text-xs font-bold text-muted-foreground flex items-center gap-1.5"
              classId={classId}
              value={courseId}
              disabled={busy}
              onChange={(id) => void chooseCourse(id)}
            />
          </div>
          <div className="flex-1 text-xs font-bold text-muted-foreground">
            Official curriculum
            <div className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 shadow-inner">
              {officialDirection ? (
                <>
                  <p className="truncate text-sm font-bold text-foreground">
                    {officialDirection}
                  </p>
                  <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                    Applied automatically for this class.
                  </p>
                </>
              ) : (
                <p className="text-sm font-normal text-muted-foreground">
                  {courseId
                    ? "Assigned by the Academic Office."
                    : "Select a course first."}
                </p>
              )}
            </div>
          </div>
          {canEdit && courseId && planStage?.state !== "blocked" && (
            <button
              disabled={busy}
              onClick={() =>
                void act({ action: "ensure_plan", course_id: courseId })
              }
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              title={
                plan
                  ? "Re-resolves the official edition for this class. Weeks, lessons and delivery records are not rewritten."
                  : undefined
              }
            >
              {plan ? "Refresh academic direction" : "Start teaching plan"}
            </button>
          )}
        </div>
      </div>

      {data && !data.courses?.length && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">
              This class needs a course before teaching can begin
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The class pathway is present, but it has no programme course to
              turn into a teaching plan.
            </p>
          </div>
          {canEdit && (
            <Link
              href={`/dashboard/classes/${classId}/edit`}
              className="shrink-0 rounded-xl bg-foreground px-4 py-2.5 text-xs font-black text-background"
            >
              Complete class setup
            </Link>
          )}
        </div>
      )}

      {pendingRelease && (
        <div className="flex flex-col gap-3 rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">
              Release to students?
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {pendingRelease.label} Learners will see the prepared lesson,
              homework and practice cards. Evaluations stay held until you
              activate them separately.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPendingRelease(null)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmPendingRelease()}
              className="rounded-xl bg-orange-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              Confirm release
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          {errorAction && (
            <Link
              href={errorAction.href}
              className="ml-6 inline-flex w-fit rounded-lg border border-red-500/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-800 hover:bg-red-500/10 dark:text-red-200"
            >
              {errorAction.label}
            </Link>
          )}
        </div>
      )}

      {busy && !data && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin text-primary" />
          Loading teaching records…
        </div>
      )}

      {courseId && !plan && !busy && planStage?.state === "blocked" && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-black text-foreground">
                {planStage.headline}
              </p>
              {planStage.detail && (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {planStage.detail}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                This is decided by the Academic Office, not in this class.
              </p>
              {planStage.actionHref && planStage.actionLabel && (
                <Link
                  href={planStage.actionHref}
                  className="mt-3 inline-flex rounded-xl border border-amber-500/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300"
                >
                  {planStage.actionLabel}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {courseId && !plan && !busy && planStage?.state !== "blocked" && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card/40">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpenIcon className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-black">No teaching plan yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            The plan inherits the official curriculum edition assigned to this class.
            Click below to generate and sync your weekly syllabus.
          </p>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act({ action: "ensure_plan", course_id: courseId })
              }
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              Start teaching plan
            </button>
          )}
        </div>
      )}

      {plan && (
        <>
          {/* Interactive Metric Cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Curriculum Weeks"
              value={weekRows.length}
              subtext={`${weeksFullyLive} live`}
              accent="primary"
              onClick={() => setWeekFilter("all")}
              isActive={weekFilter === "all"}
            />
            <StatCard
              label="Delivered"
              value={weeksTaught}
              subtext={`${Math.round((weeksTaught / (weekRows.length || 1)) * 100)}% taught`}
              accent="emerald"
              onClick={() => setWeekFilter("taught")}
              isActive={weekFilter === "taught"}
            />
            <StatCard
              label="Needs Work"
              value={weeksNeedingWork}
              subtext="Prep / Release"
              accent="amber"
              onClick={() => setWeekFilter("todo")}
              isActive={weekFilter === "todo"}
            />
            <StatCard
              label="Slide Decks"
              value={data.slide_decks?.length || 0}
              subtext="Visual teaching"
              accent="violet"
            />
            <StatCard
              label="Flashcards"
              value={data.flashcard_decks?.length || 0}
              subtext="Active recall"
              accent="cyan"
            />
            <StatCard
              label="Projects & Assg."
              value={(data.projects?.length || 0) + (data.assignments?.length || 0)}
              subtext="Coursework"
              accent="rose"
            />
          </div>

          {/* Up Next / Command Hero Card */}
          {resumeWeek && (
            <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-4 sm:p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      Active Teaching Focus
                    </span>
                    <span className="rounded-full border border-border bg-background/80 px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                      Week {resumeWeek.week}
                      {resumeWeek.session != null ? ` · Class ${resumeWeek.session}` : ""}
                    </span>
                    {resumeWeek.weekMeta?.official_position && (
                      <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                        T{resumeWeek.weekMeta.official_position.programme_term} · W{resumeWeek.weekMeta.official_position.programme_week}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-black text-foreground sm:text-lg leading-tight">
                    {resumeWeek.topic}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                    <span>{resumeWeek.packageStatus.readyCount} of 5 assets prepared</span>
                    <span>•</span>
                    <span className={
                      resumeWeek.visibilitySummary.needsRelease
                        ? "font-semibold text-orange-600 dark:text-orange-400"
                        : resumeWeek.packageStatus.complete
                        ? "font-semibold text-emerald-600 dark:text-emerald-400"
                        : "font-semibold text-amber-600 dark:text-amber-400"
                    }>
                      {resumeWeek.visibilitySummary.needsRelease
                        ? `${resumeWeek.visibilitySummary.heldCount} held for students`
                        : resumeWeek.packageStatus.complete
                        ? "Ready for class"
                        : `${resumeWeek.packageStatus.missing.length} assets still needed`}
                    </span>
                  </div>
                </div>

                {/* Hero Quick Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {canEdit && resumeWeek.recommendedAction === "release" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setPendingRelease({
                          label: `Week ${resumeWeek.week}${
                            resumeWeek.session != null
                              ? ` · Class ${resumeWeek.session}`
                              : ""
                          } will become visible to this class.`,
                          body: {
                            action: "release_week",
                            lesson_plan_id: plan.id,
                            week_number: resumeWeek.week,
                            ...(resumeWeek.session != null
                              ? { session: resumeWeek.session }
                              : {}),
                          },
                        })
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 px-5 py-2.5 text-xs font-black text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <RocketLaunchIcon className="h-4 w-4" />
                      Release Week {resumeWeek.week}
                    </button>
                  )}

                  {resumeWeek.lesson && resumeWeek.recommendedAction === "teach" && (
                    <Link
                      href={resumeWeek.liveSessionHref}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-5 py-2.5 text-xs font-black text-primary-foreground shadow-md transition-all active:scale-[0.98]"
                    >
                      <VideoCameraIcon className="h-4 w-4" />
                      Start Live Class
                    </Link>
                  )}

                  {canEdit &&
                    (resumeWeek.recommendedAction === "prepare" ||
                      resumeWeek.recommendedAction === "refresh") && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setAiWeek({
                          week: resumeWeek.week,
                          session: resumeWeek.session,
                          topic: resumeWeek.topic,
                          objectives: resumeWeek.objectives,
                          activities: resumeWeek.activities,
                          notes: resumeWeek.weekMeta.notes,
                          assignment: resumeWeek.weekMeta.assignment,
                          project: resumeWeek.weekMeta.project,
                        })
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 px-4 py-2.5 text-xs font-black text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <SparklesIcon className="h-4 w-4" />
                      {resumeWeek.recommendedAction === "refresh"
                        ? "Refresh changed assets"
                        : "Prepare teaching package"}
                    </button>
                  )}

                  {canEdit &&
                    (resumeWeek.recommendedAction === "assess" ||
                      resumeWeek.recommendedAction === "review_assessment") && (
                    <Link
                      href={
                        resumeWeek.evaluation
                          ? `/dashboard/cbt/${resumeWeek.evaluation.id}`
                          : buildCbtNewHref({
                              classId,
                              courseId,
                              programId: data?.class?.program_id,
                              schoolId: data?.class?.school_id,
                              lessonPlanId: plan.id,
                              lessonId: resumeWeek.lesson?.id || null,
                              curriculumId: plan.curriculum_version_id,
                              week: resumeWeek.week,
                              topic: resumeWeek.topic,
                            })
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground"
                    >
                      <DocumentChartBarIcon className="h-4 w-4" />
                      {resumeWeek.recommendedAction === "review_assessment"
                        ? "Review assessment"
                        : "Add assessment"}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Hub Strip */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href={buildLessonPlanHref(plan.id)}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 transition-all hover:border-primary/50 hover:shadow-sm"
            >
              <div className="min-w-0">
                <span className="block text-sm font-black text-foreground group-hover:text-primary transition-colors">
                  Open full teaching plan
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Edit weeks, syllabus quality, and deep AI generators.
                </span>
              </div>
              <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary group-hover:translate-x-0.5 transition-transform">
                Open →
              </span>
            </Link>

            {!planReady && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                    {plan.status ?? "draft"}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                    Not ready to generate
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground/80">
                  {planBlock?.detail ?? planBlock?.error}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: "publish_plan",
                          lesson_plan_id: plan.id,
                        })
                      }
                      className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-[10px] font-black uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                    >
                      Publish plan
                    </button>
                  )}
                  <Link
                    href={planBlock?.action_href ?? buildLessonPlanHref(plan.id)}
                    className="inline-flex min-h-9 items-center rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 text-[10px] font-black uppercase tracking-widest text-amber-800 transition-colors hover:bg-amber-500/25 dark:text-amber-200"
                  >
                    {planBlock?.action_label ?? "Open plan"} →
                  </Link>
                </div>
              </div>
            )}

            {canEdit && (
              <button
                type="button"
                disabled={
                  busy || aiBusy || weekRows.length === 0 || !planReady
                }
                onClick={() => void generateLessonsWithAi()}
                title={
                  !planReady
                    ? `This plan is a ${
                        plan.status ?? "draft"
                      }. Publish it before generating.`
                    : weekRows.length === 0
                    ? "This plan has no curriculum weeks yet, so there is nothing to generate lessons for."
                    : undefined
                }
                className="flex items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 text-left transition-all hover:border-violet-500/50 hover:shadow-sm disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-black text-foreground">
                    <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    {aiBusy
                      ? "Generating lessons…"
                      : "Generate lesson foundations"}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Creates missing lessons in bulk across all curriculum weeks.
                  </span>
                </span>
                {aiBusy ? (
                  <ArrowPathIcon className="h-4 w-4 shrink-0 animate-spin text-violet-600 dark:text-violet-400" />
                ) : (
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-violet-700 dark:text-violet-300">
                    Run →
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Quick Tool Navigation Buttons */}
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildCurriculumHref({
                courseId,
                programId: data?.class?.program_id,
              })}
              className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40 transition-colors"
            >
              Curriculum Map
            </Link>
            <Link
              href={buildClassAssessmentHref({ classId, courseId })}
              className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40 transition-colors"
            >
              Assessment Desk
            </Link>
            <Link
              href={buildGradesHref({ classId, courseId })}
              className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40 transition-colors"
            >
              Gradebook
            </Link>
            <Link
              href={buildResultsHref({ classId, courseId })}
              className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40 transition-colors"
            >
              Term Results
            </Link>
            <Link
              href="/dashboard/teaching/approvals"
              className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40 transition-colors"
            >
              Approvals
            </Link>
          </div>

          {/* Main Teaching Packages Hub */}
          <div className="rounded-2xl border border-border bg-background p-3.5 sm:p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-black text-foreground">
                  Weekly Teaching Packages
                </h3>
                <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                  Complete 5-asset package: Lesson, Slides, Flashcards, Assignment, and Project.
                </p>
              </div>
              <span className="w-fit rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                5 Linked Assets
              </span>
            </div>

            {/* Jump to Week Strip (Mobile & Desktop) */}
            {visibleWeekRows.length > 0 && (
              <div className="mt-4 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Jump to Week
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {visibleWeekRows.length} shown
                  </span>
                </div>
                <div
                  className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none snap-x snap-mandatory [-webkit-overflow-scrolling:touch]"
                  style={{ scrollbarWidth: "none" }}
                >
                  {visibleWeekRows.map((row) => {
                    const isTaught = row.taught;
                    const isReady = row.packageStatus.complete;
                    const isHeld = row.visibilitySummary.needsRelease;
                    const dotClass = isTaught
                      ? "bg-emerald-500"
                      : isHeld
                      ? "bg-orange-500"
                      : isReady
                      ? "bg-emerald-400"
                      : "bg-amber-400";
                    return (
                      <button
                        key={row.rowKey}
                        type="button"
                        onClick={() => scrollToWeek(row.rowKey)}
                        title={`Week ${row.week}: ${row.topic} (${
                          isTaught
                            ? "Taught"
                            : isHeld
                            ? "Held"
                            : isReady
                            ? "Ready"
                            : "Needs prep"
                        })`}
                        className="group snap-start shrink-0 flex items-center gap-1.5 rounded-xl border border-border bg-card/80 px-2.5 py-1.5 text-xs font-bold transition-all hover:border-primary hover:bg-primary/5 active:scale-95"
                      >
                        <span className="text-foreground">
                          W{row.week}{row.session != null ? ` · C${row.session}` : ""}
                        </span>
                        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filter Bar, Term Selector, and Topic Search Input */}
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["all", `All (${weekRows.length})`],
                    ["todo", `Needs Work (${weeksNeedingWork})`],
                    ["taught", `Taught (${weeksTaught})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={weekFilter === key}
                    onClick={() => setWeekFilter(key)}
                    className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                      weekFilter === key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}

                {termsPresent.length > 1 && (
                  <div className="flex items-center gap-1 sm:border-l border-border sm:pl-2">
                    {[0, ...termsPresent].map((termNum) => {
                      const inTerm = weekRows.filter(
                        (row) => termNum === 0 || row.term === termNum
                      );
                      return (
                        <button
                          key={termNum}
                          type="button"
                          onClick={() => setTermFilter(termNum)}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-all ${
                            termFilter === termNum
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "text-muted-foreground hover:text-foreground border border-transparent"
                          }`}
                        >
                          {termNum === 0 ? "All Terms" : `Term ${termNum}`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Instant Search Box */}
              <div className="relative w-full lg:w-72">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search topics, objectives, weeks…"
                  className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    aria-label="Clear search"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Floating / Sticky Mobile Batch Bar */}
            {canEdit && pickedRows.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/15 via-background to-primary/10 p-3 sm:p-4 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground">
                    {pickedRows.length}
                  </span>
                  <span className="text-xs font-black text-foreground">
                    Teaching slot{pickedRows.length === 1 ? "" : "s"} selected
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "record_delivery_bulk",
                        lesson_plan_id: plan.id,
                        targets: pickedRows.map((row) => ({
                          week_number: row.week,
                          session: row.session,
                        })),
                        status: "delivered",
                      }).then((ok) => {
                        if (ok) setPicked(new Set());
                      })
                    }
                    className="inline-flex min-h-9 items-center rounded-xl bg-primary px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
                  >
                    Mark Delivered
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      setPendingRelease({
                        label: `${pickedRows.length} teaching slot${
                          pickedRows.length === 1 ? "" : "s"
                        } will become visible to this class.`,
                        body: {
                          action: "release_week_bulk",
                          lesson_plan_id: plan.id,
                          targets: pickedRows.map((row) => ({
                            week_number: row.week,
                            session: row.session,
                          })),
                        },
                      })
                    }
                    className="inline-flex min-h-9 items-center rounded-xl border border-orange-500/40 bg-orange-500/10 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-orange-700 dark:text-orange-300 hover:bg-orange-500/20 disabled:opacity-50"
                  >
                    Release to Class
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "record_delivery_bulk",
                        lesson_plan_id: plan.id,
                        targets: pickedRows.map((row) => ({
                          week_number: row.week,
                          session: row.session,
                        })),
                        status: "planned",
                      }).then((ok) => {
                        if (ok) setPicked(new Set());
                      })
                    }
                    className="inline-flex min-h-9 items-center rounded-xl border border-border bg-card px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    Not Taught
                  </button>
                  <button
                    onClick={() => setPicked(new Set())}
                    className="p-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* List of Week Cards */}
            <div className="mt-4 space-y-3">
              {visibleWeekRows.map((row) => {
                const {
                  weekMeta,
                  week,
                  session,
                  lesson,
                  assignment,
                  project,
                  slideDeck,
                  flashcardDeck,
                  evaluation,
                  topic,
                  objectives,
                  activities,
                  packageStatus,
                  visibility,
                  visibilitySummary,
                  classroomAction,
                  taught,
                  provenance,
                  evaluationStatus,
                  recommendedAction,
                  manualLessonHref,
                  liveSessionHref,
                  rowKey,
                } = row;

                const isExpanded = expandedCards.has(rowKey);

                const statusLabel = !packageStatus.complete
                  ? `${packageStatus.missing.length} missing`
                  : visibilitySummary.needsRelease
                  ? "Held"
                  : taught
                  ? "Taught"
                  : "Live";

                const statusClass = !packageStatus.complete
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : visibilitySummary.needsRelease
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

                return (
                  <article
                    id={`week-card-${rowKey}`}
                    key={rowKey}
                    className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                      picked.has(rowKey)
                        ? "border-primary/50 bg-primary/5 shadow-md"
                        : taught
                        ? "border-border/60 bg-card/60"
                        : "border-border bg-card shadow-sm hover:border-border/80"
                    }`}
                  >
                    <div className="p-3.5 sm:p-4">
                      {/* Top Header Row */}
                      <div className="flex items-start gap-3">
                        {canEdit && (
                          <label className="flex shrink-0 items-center pt-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              aria-label={`Select week ${week}${
                                session ? ` class ${session}` : ""
                              }`}
                              checked={picked.has(rowKey)}
                              onChange={(event) =>
                                setPicked((previous) => {
                                  const next = new Set(previous);
                                  if (event.target.checked) next.add(rowKey);
                                  else next.delete(rowKey);
                                  return next;
                                })
                              }
                              className="h-4 w-4 rounded accent-primary cursor-pointer"
                            />
                          </label>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                              Week {week}
                              {session != null && session > 0
                                ? ` · Class ${session}`
                                : ""}
                            </span>
                            {weekMeta.official_position && (
                              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                                Curriculum T
                                {weekMeta.official_position.programme_term} · W
                                {weekMeta.official_position.programme_week}
                              </span>
                            )}
                            {taught && (
                              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                ✓ Taught
                              </span>
                            )}
                            {provenance.customized ? (
                              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">
                                Class override
                              </span>
                            ) : provenance.shared ? (
                              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">
                                Shared master
                              </span>
                            ) : null}
                            {provenance.staleDerived && (
                              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                Refreshing assets
                              </span>
                            )}
                          </div>

                          <h4 className="mt-1 text-sm font-black text-foreground sm:text-base leading-snug">
                            {topic}
                          </h4>

                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {packageStatus.readyCount} of 5 prepared
                            {visibilitySummary.heldCount > 0
                              ? ` · ${visibilitySummary.heldCount} held for students`
                              : visibilitySummary.fullyLive
                              ? " · live for class"
                              : ""}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      {/* Interactive 5-Asset Segment Hub */}
                      <div className="mt-3.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
                        <AssetCardTile
                          label="Lesson"
                          icon={BookOpenIcon}
                          state={visibility.lesson}
                          href={lesson ? `/dashboard/lessons/${lesson.id}` : canEdit ? manualLessonHref : undefined}
                          actionLabel={lesson ? "Open" : "Create"}
                        />
                        <AssetCardTile
                          label="Slides"
                          icon={PresentationChartLineIcon}
                          state={visibility.slides}
                          href={
                            lesson
                              ? buildLessonSlidesHref({
                                  lessonId: lesson.id,
                                  returnClassId: classId,
                                })
                              : undefined
                          }
                          actionLabel={slideDeck ? "Open" : "Create"}
                        />
                        <AssetCardTile
                          label="Flashcards"
                          icon={BoltIcon}
                          state={visibility.flashcards}
                          href={
                            flashcardDeck
                              ? buildFlashcardsHref({
                                  deckId: flashcardDeck.id,
                                  classId,
                                  courseId,
                                  lessonId: lesson?.id || null,
                                  lessonPlanId: plan.id,
                                  topic,
                                })
                              : undefined
                          }
                          onClick={
                            !flashcardDeck && canEdit
                              ? () => void createFlashcardDeck(lesson || weekMeta, week)
                              : undefined
                          }
                          actionLabel={flashcardDeck ? "Open" : "Create"}
                        />
                        <AssetCardTile
                          label="Assignment"
                          icon={ClipboardDocumentListIcon}
                          state={visibility.assignment}
                          href={
                            assignment
                              ? `/dashboard/assignments/${assignment.id}`
                              : canEdit
                              ? buildAssignmentNewHref({
                                  classId,
                                  courseId,
                                  lessonPlanId: plan.id,
                                  lessonId: lesson?.id || null,
                                  week,
                                })
                              : undefined
                          }
                          actionLabel={assignment ? "Open" : "Create"}
                        />
                        <AssetCardTile
                          label="Project"
                          icon={RocketLaunchIcon}
                          state={visibility.project}
                          href={
                            project
                              ? `/dashboard/projects/${project.id}`
                              : canEdit
                              ? buildProjectNewHref({
                                  classId,
                                  courseId,
                                  schoolId: data?.class?.school_id,
                                  lessonPlanId: plan.id,
                                  lessonId: lesson?.id || null,
                                  week,
                                })
                              : undefined
                          }
                          actionLabel={project ? "Open" : "Create"}
                        />
                        <AssetCardTile
                          label="Evaluation"
                          icon={DocumentChartBarIcon}
                          state={evaluationStatus}
                          href={
                            evaluation
                              ? `/dashboard/cbt/${evaluation.id}`
                              : canEdit
                              ? buildCbtNewHref({
                                  classId,
                                  courseId,
                                  programId: data?.class?.program_id,
                                  schoolId: data?.class?.school_id,
                                  lessonPlanId: plan.id,
                                  lessonId: lesson?.id || null,
                                  curriculumId: plan.curriculum_version_id,
                                  week,
                                  topic,
                                })
                              : undefined
                          }
                          actionLabel={evaluation ? "Open" : "Create"}
                        />
                      </div>

                      {/* Streamlined Primary & Secondary Action Toolbar */}
                      <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {/* Primary Action Button */}
                        <div className="flex-1 flex flex-wrap gap-2">
                          {canEdit && recommendedAction === "release" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setPendingRelease({
                                  label: `Week ${week}${
                                    session != null ? ` · Class ${session}` : ""
                                  } will become visible to this class.`,
                                  body: {
                                    action: "release_week",
                                    lesson_plan_id: plan.id,
                                    week_number: week,
                                    ...(session != null ? { session } : {}),
                                  },
                                })
                              }
                              className="inline-flex min-h-10 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 px-4 py-2 text-xs font-black text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
                            >
                              <RocketLaunchIcon className="h-4 w-4" />
                              Release to Class
                            </button>
                          )}

                          {lesson && recommendedAction === "teach" && (
                            <Link
                              href={`/dashboard/lessons/${lesson.id}`}
                              className="inline-flex min-h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 px-4 py-2 text-xs font-black text-primary-foreground shadow-sm transition-transform active:scale-[0.98]"
                            >
                              <BookOpenIcon className="h-4 w-4" />
                              Open class materials
                            </Link>
                          )}

                          {canEdit &&
                            (recommendedAction === "prepare" ||
                              recommendedAction === "refresh") && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setAiWeek({
                                  week,
                                  session,
                                  topic,
                                  objectives,
                                  activities,
                                  notes: weekMeta.notes,
                                  assignment: weekMeta.assignment,
                                  project: weekMeta.project,
                                })
                              }
                              className={`inline-flex min-h-10 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-black shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50 ${
                                lesson || classroomAction === "release"
                                  ? "border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20"
                                  : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:brightness-110"
                              }`}
                            >
                              <SparklesIcon className="h-4 w-4" />
                              {recommendedAction === "refresh"
                                ? "Refresh changed assets"
                                : lesson
                                  ? `Prepare ${packageStatus.missing.length} missing`
                                  : "Prepare teaching package"}
                            </button>
                          )}

                          {canEdit &&
                            (recommendedAction === "assess" ||
                              recommendedAction === "review_assessment") && (
                            <Link
                              href={
                                evaluation
                                  ? `/dashboard/cbt/${evaluation.id}`
                                  : buildCbtNewHref({
                                      classId,
                                      courseId,
                                      programId: data?.class?.program_id,
                                      schoolId: data?.class?.school_id,
                                      lessonPlanId: plan.id,
                                      lessonId: lesson?.id || null,
                                      curriculumId: plan.curriculum_version_id,
                                      week,
                                      topic,
                                    })
                              }
                              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground shadow-sm sm:flex-initial"
                            >
                              <DocumentChartBarIcon className="h-4 w-4" />
                              {recommendedAction === "review_assessment"
                                ? "Review assessment"
                                : "Add assessment"}
                            </Link>
                          )}
                        </div>

                        {/* Secondary Quick-Access Tools */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {canEdit && recommendedAction === "teach" && (
                            <Link
                              href={liveSessionHref}
                              title="Start Live Class"
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-bold text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            >
                              <VideoCameraIcon className="h-3.5 w-3.5 text-primary" />
                              <span className="hidden sm:inline">Live Class</span>
                            </Link>
                          )}

                          {canEdit && taught && (
                            <Link
                              href={buildGradesHref({ classId, courseId })}
                              title="Grade Week"
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-bold text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            >
                              <DocumentChartBarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="hidden sm:inline">Grade</span>
                            </Link>
                          )}

                          {canEdit && !taught && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act({
                                  action: "record_delivery",
                                  lesson_plan_id: plan.id,
                                  week_number: week,
                                  ...(session != null ? { session } : {}),
                                  lesson_id: lesson?.id || null,
                                  status: "delivered",
                                })
                              }
                              title="Mark as taught"
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-black text-muted-foreground transition-all hover:text-foreground"
                            >
                              <CheckCircleIcon className="h-3.5 w-3.5" />
                              <span>Mark Taught</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => toggleCardExpanded(rowKey)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
                            title={isExpanded ? "Collapse tools" : "Deep asset tools"}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? (
                              <ChevronUpIcon className="h-4 w-4" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Deep Asset Builder Section */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/25 p-3.5 sm:p-4 animate-in fade-in duration-200">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2.5">
                          Direct Asset Builders & Editors
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-wrap">
                          {lesson ? (
                            <Link
                              href={`/dashboard/lessons/${lesson.id}`}
                              className={toolLinkClass}
                            >
                              Open lesson ↗
                            </Link>
                          ) : canEdit ? (
                            <Link href={manualLessonHref} className={toolLinkClass}>
                              Rich lesson builder
                            </Link>
                          ) : null}
                          {lesson && (
                            <Link
                              href={buildLessonSlidesHref({
                                lessonId: lesson.id,
                                returnClassId: classId,
                              })}
                              className={toolLinkClass}
                            >
                              {slideDeck ? "Open slides ↗" : "Add slides +"}
                            </Link>
                          )}
                          {flashcardDeck ? (
                            <Link
                              href={buildFlashcardsHref({
                                deckId: flashcardDeck.id,
                                classId,
                                courseId,
                                lessonId: lesson?.id || null,
                                lessonPlanId: plan.id,
                                topic,
                              })}
                              className={toolLinkClass}
                            >
                              Open flashcards ↗
                            </Link>
                          ) : canEdit ? (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void createFlashcardDeck(lesson || weekMeta, week)
                              }
                              className={`${toolLinkClass} disabled:opacity-50`}
                            >
                              Create flashcards +
                            </button>
                          ) : null}
                          {assignment ? (
                            <Link
                              href={`/dashboard/assignments/${assignment.id}`}
                              className={toolLinkClass}
                            >
                              Open assignment ↗
                            </Link>
                          ) : canEdit ? (
                            <Link
                              href={buildAssignmentNewHref({
                                classId,
                                courseId,
                                lessonPlanId: plan.id,
                                lessonId: lesson?.id || null,
                                week,
                              })}
                              className={toolLinkClass}
                            >
                              Create assignment +
                            </Link>
                          ) : null}
                          {project ? (
                            <Link
                              href={`/dashboard/projects/${project.id}`}
                              className={toolLinkClass}
                            >
                              Open project ↗
                            </Link>
                          ) : canEdit ? (
                            <Link
                              href={buildProjectNewHref({
                                classId,
                                courseId,
                                schoolId: data?.class?.school_id,
                                lessonPlanId: plan.id,
                                lessonId: lesson?.id || null,
                                week,
                              })}
                              className={toolLinkClass}
                            >
                              Create project +
                            </Link>
                          ) : null}
                          {evaluation ? (
                            <Link
                              href={`/dashboard/cbt/${evaluation.id}`}
                              className={toolLinkClass}
                            >
                              Open evaluation ↗
                            </Link>
                          ) : canEdit ? (
                            <Link
                              href={buildCbtNewHref({
                                classId,
                                courseId,
                                programId: data?.class?.program_id,
                                schoolId: data?.class?.school_id,
                                lessonPlanId: plan.id,
                                lessonId: lesson?.id || null,
                                curriculumId: plan.curriculum_version_id,
                                week,
                                topic,
                              })}
                              className={toolLinkClass}
                            >
                              Create evaluation +
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}

              {weekRows.length > 0 && visibleWeekRows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center bg-card/30">
                  <p className="text-sm font-bold text-foreground">
                    No matching weeks found
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                    {searchQuery
                      ? `No topics or objectives match "${searchQuery}".`
                      : weekFilter === "todo"
                      ? "Every week in this term has its full package prepared!"
                      : "No weeks match the current active filter."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setWeekFilter("all");
                      setTermFilter(0);
                      setSearchQuery("");
                    }}
                    className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground shadow-sm"
                  >
                    Reset all filters ({weekRows.length} weeks)
                  </button>
                </div>
              )}

              {weekRows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center bg-card/30">
                  <p className="text-xs leading-5 text-muted-foreground">
                    This plan has no curriculum weeks yet. Its weeks come from
                    the official edition assigned to this class. Try Refresh
                    academic direction, or open the full teaching plan to add
                    weeks by hand.
                  </p>
                  <Link
                    href={buildLessonPlanHref(plan.id)}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-black text-foreground transition-colors hover:border-primary/40"
                  >
                    Open the full teaching plan
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Week AI Generator Modal */}
      {aiWeek && plan && (
        <WeekAIGenerator
          week={aiWeek}
          planId={plan.id}
          courseId={courseId}
          classId={classId}
          existing={(() => {
            const key = weekSessionLookupKey(
              aiWeek.week,
              aiWeek.session ?? null
            );
            const row = weekRows.find((item) => item.rowKey === key);
            return {
              lessonId: row?.lesson?.id,
              slideDeckId: row?.slideDeck?.id,
              deckId: row?.flashcardDeck?.id,
              assignmentId: row?.assignment?.id,
              projectId: row?.project?.id,
            };
          })()}
          onClose={() => setAiWeek(null)}
          onDone={() => {
            setAiWeek(null);
            void load(courseId);
          }}
        />
      )}
    </div>
  );
}

const toolLinkClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-[10px] font-black text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5";

function StatCard({
  label,
  value,
  subtext,
  accent = "primary",
  onClick,
  isActive,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: "primary" | "emerald" | "amber" | "violet" | "cyan" | "rose";
  onClick?: () => void;
  isActive?: boolean;
}) {
  const borderTone =
    isActive
      ? "border-primary ring-2 ring-primary/20 bg-primary/5"
      : "border-border/80 bg-card/70 hover:border-border";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-2xl border p-3 sm:p-4 text-left transition-all ${borderTone} ${
        onClick ? "cursor-pointer active:scale-95" : "cursor-default"
      }`}
    >
      <p className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
        {value}
      </p>
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mt-0.5 truncate">
        {label}
      </p>
      {subtext && (
        <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1 truncate">
          {subtext}
        </p>
      )}
    </button>
  );
}

function AssetCardTile({
  label,
  icon: Icon,
  state,
  href,
  onClick,
  actionLabel,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  state: AssetVisibility;
  href?: string;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const isLive = state === "live";
  const isHeld = state === "held";
  const isMissing = state === "missing";

  const colorClass = isLive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : isHeld
    ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
    : "border-border/60 bg-muted/20 text-muted-foreground opacity-80";

  const dotClass = isLive
    ? "bg-emerald-500"
    : isHeld
    ? "bg-orange-500"
    : "bg-muted-foreground/40";

  const content = (
    <div
      className={`group flex flex-col justify-between rounded-xl border p-2 text-left transition-all duration-150 ${colorClass} ${
        href || onClick ? "hover:border-primary/50 hover:shadow-xs active:scale-95 cursor-pointer" : ""
      }`}
      title={`${label}: ${isLive ? "Live for students" : isHeld ? "Prepared · Held for students" : "Missing"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
      </div>
      <div className="mt-1.5">
        <p className="text-[10px] font-black truncate">{label}</p>
        <p className="text-[9px] font-bold opacity-75 truncate uppercase">
          {isLive ? "Live" : isHeld ? "Held" : actionLabel || "Add"}
        </p>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full">
        {content}
      </button>
    );
  }

  return <div>{content}</div>;
}
