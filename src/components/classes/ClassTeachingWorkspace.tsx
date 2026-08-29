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
  EyeSlashIcon,
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
  ClipboardDocumentCheckIcon,
} from "@/lib/icons";
import type { StageStatus } from "@/lib/academic/status";
import { validateLessonPlanForGeneration } from "@/lib/api-guards";
import {
  buildAssignmentNewHref,
  buildAttendanceHref,
  buildClassAssessmentHref,
  buildCbtNewHref,
  buildCoverageHref,
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
  WEEK_CONTENT_ORIGIN_LABEL,
} from "@/lib/academic/teaching-workspace";
import {
  teachingMeetingLabel,
  teachingMeetingShortLabel,
} from "@/lib/academic/session-identity";
import {
  expandPlanWeeksForMeetings,
} from "@/lib/academic/school-programme-standing";
import {
  WEEK_CONTENT_TYPES,
  WEEK_CONTENT_TYPE_LABELS,
} from "@/lib/academic/auto-generate-settings";
import { requestTrackedWeekGeneration } from "@/lib/academic/week-generation-client";
import { summarizeTeachingWorkflow } from "@/lib/academic/teaching-workflow-summary";
import {
  hostAssessmentSit,
  isHostAssessmentWeek,
  taughtAssessmentBrief,
} from "@/lib/academic/taught-assessment";
import { hostPaperLabel } from "@/lib/academic/host-marks";
import { pickTimetableSessionForMeeting, schoolCalendarDate } from "@/lib/timetable/sessions-from-slots";
import { createClient } from "@/lib/supabase/client";
import { SmartCourseSelect } from "@/components/courses/SmartCourseSelect";
import WeekAIGenerator from "@/components/ai/WeekAIGenerator";
import BodyPortal, { useOverlayScrollLock } from "@/components/ui/BodyPortal";

type Props = {
  classId: string;
  initialCourseId?: string | null;
  canEdit: boolean;
  canManageCurriculum: boolean;
  onCourseChange?: (id: string | null) => Promise<void> | void;
  onCoverageChange?: (coverage: {
    delivered: number;
    planned: number;
  }) => void;
  onAttentionChange?: (attention: {
    weeksNeedingWork: number;
    weeksFullyLive: number;
    planned: number;
    missingContent: number;
    readyToShare: number;
  }) => void;
};

export function ClassTeachingWorkspace({
  classId,
  initialCourseId,
  canEdit,
  canManageCurriculum,
  onCourseChange,
  onCoverageChange,
  onAttentionChange,
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
  const [aiStatus, setAiStatus] = useState<{
    tone: "progress" | "success" | "warning";
    message: string;
  } | null>(null);
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
    mode?: "release" | "hold";
  } | null>(null);
  const [nextActionInView, setNextActionInView] = useState(true);

  useEffect(() => {
    if (!pendingRelease) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setPendingRelease(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, pendingRelease]);
  useOverlayScrollLock(Boolean(pendingRelease));

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
      if (j.warning) {
        setAiStatus({ tone: "warning", message: j.warning });
      } else if (body.action === "release_week") {
        setAiStatus({
          tone: "success",
          message:
            "This teaching package is now visible to the class. Tests remain private until you open them separately.",
        });
      } else if (body.action === "release_week_bulk") {
        const completed = Number(j.data?.completed_count) || 0;
        setAiStatus({
          tone: "success",
          message: `${completed} teaching package${completed === 1 ? " is" : "s are"} now visible to the class.`,
        });
      } else if (body.action === "hold_week") {
        setAiStatus({
          tone: "success",
          message: "The complete teaching package is now held from students. Their submissions, scores and attendance were preserved.",
        });
      }
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

  async function generateMissingPackages() {
    if (!plan) return;
    const targets = weekRows.filter(
      (row) =>
        row.recommendedAction === "prepare" ||
        row.recommendedAction === "refresh"
    );
    if (targets.length === 0) {
      setAiStatus({
        tone: "success",
        message: "Every teaching package is already prepared. Nothing was duplicated.",
      });
      return;
    }

    setAiBusy(true);
    setError("");
    setErrorAction(null);
    setAiStatus({
      tone: "progress",
      message: `Preparing 1 of ${targets.length} teaching packages…`,
    });
    try {
      let generated = 0;
      let skipped = 0;
      let alreadyRunning = 0;
      const failures: string[] = [];

      for (let index = 0; index < targets.length; index++) {
        const target = targets[index];
        setAiStatus({
          tone: "progress",
          message: `Preparing ${teachingMeetingLabel(
            target.week,
            target.session,
            target.meetingsInWeek
          )} · ${index + 1} of ${targets.length}…`,
        });
        const result = await requestTrackedWeekGeneration({
          planId: plan.id,
          week: target.week,
          session: target.session,
          // The primary teacher action always prepares the complete package.
          // Type-level repair remains available in Advanced.
          types: WEEK_CONTENT_TYPES,
        });
        if (result.alreadyRunning === true) alreadyRunning += 1;
        generated += Number(result.generated) || 0;
        skipped += Number(result.skipped) || 0;
        if (result.success === false) {
          failures.push(
            `${teachingMeetingLabel(
              target.week,
              target.session,
              target.meetingsInWeek
              )}: ${result.error || "package generation did not finish"}`
          );
          continue;
        }
        if (Array.isArray(result.failedTypes) && result.failedTypes.length > 0) {
          const readableTypes = result.failedTypes.map(
            (type) =>
              (WEEK_CONTENT_TYPE_LABELS as Record<string, string>)[type] ??
              "one learning item"
          );
          failures.push(
            `${teachingMeetingLabel(
              target.week,
              target.session,
              target.meetingsInWeek
            )}: ${readableTypes.join(", ")} still need attention`
          );
        }
      }

      await load(courseId);
      setAiStatus({
        tone: failures.length > 0 ? "warning" : "success",
        message: failures.length > 0
          ? `${generated} content item${generated === 1 ? "" : "s"} saved, but ${failures.length} package${failures.length === 1 ? "" : "s"} still need attention. ${failures.slice(0, 2).join(" · ")}`
          : alreadyRunning > 0 && generated === 0
            ? `${alreadyRunning} teaching package${alreadyRunning === 1 ? " is" : "s are"} already being prepared. Saved items will appear here as they finish.`
          : generated > 0
            ? `${generated} content item${generated === 1 ? "" : "s"} saved across complete teaching packages${skipped > 0 ? `; ${skipped} existing item${skipped === 1 ? " was" : "s were"} kept.` : "."}`
            : "Every teaching package was already prepared. Nothing was duplicated.",
      });
    } catch (e: any) {
      setAiStatus(null);
      setError(
        e instanceof TypeError && /fetch/i.test(e.message || "")
          ? "The generation connection was interrupted. Refresh this class before retrying—completed lessons remain saved and will reappear here."
          : e.message || "AI generation failed"
      );
    } finally {
      setAiBusy(false);
    }
  }

  const plan = data?.plan;
  const progress = data?.progress;
  const preparationStatus = data?.preparation_status as
    | {
        available: boolean;
        state: "idle" | "running" | "healthy" | "attention";
        message: string;
        week: number | null;
        session: number | null;
      }
    | undefined;
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
      planWeeks: expandPlanWeeksForMeetings(
        Array.isArray(plan?.plan_data?.weeks) ? plan.plan_data.weeks : [],
        data?.programme_policy?.sessionsPerWeek ?? 2
      ),
      lessons: data?.lessons,
      assignments: data?.assignments,
      projects: data?.projects,
      slideDecks: data?.slide_decks,
      flashcardDecks: data?.flashcard_decks,
      exams: data?.exams,
      deliveries: data?.deliveries,
      standing: data?.programme_policy?.standing,
      usesHostEvaluation: data?.programme_policy?.usesHostEvaluation,
      examCapture: data?.programme_policy?.examCapture,
      testCapture: data?.programme_policy?.testCapture,
      termStart: data?.class?.academic_terms?.start_date ?? null,
      activities: data?.term_activities,
    });
    const meetingCountByWeek = new Map<number, number>();
    for (const row of assembled) {
      meetingCountByWeek.set(
        row.week,
        (meetingCountByWeek.get(row.week) ?? 0) + 1
      );
    }
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
        session,
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
      const slotLabel = teachingMeetingLabel(
        week,
        session,
        meetingCountByWeek.get(week) ?? 1
      );
      const timetableSession =
        row.recommendedAction === "teach"
          ? pickTimetableSessionForMeeting(
              (data?.timetable_sessions ?? []) as Array<{
                id: string;
                session_date: string;
                start_time?: string | null;
              }>,
              session ?? 1
            )
          : null;
      const today = schoolCalendarDate();
      const sessionDate = timetableSession
        ? String(timetableSession.session_date).slice(0, 10)
        : "";
      const timetableSessionId =
        timetableSession && sessionDate && sessionDate <= today
          ? timetableSession.id
          : null;
      const attendanceHref = buildAttendanceHref({
        classId,
        week,
        session,
        sessionId: sessionDate === today ? timetableSessionId : null,
        topic: topic ? `${slotLabel}: ${topic}` : slotLabel,
      });
      const sit = hostAssessmentSit(
        row.calendarRole,
        data?.programme_policy
      );
      const taughtBrief = taughtAssessmentBrief({
        weeks: assembled,
        calendarRole: row.calendarRole,
        weekNumber: week,
        termStart: data?.class?.academic_terms?.start_date ?? null,
        activities: data?.term_activities,
        sit,
        courseName: selectedCourse?.title,
      });
      const taughtAssessmentHref =
        taughtBrief && taughtBrief.topics.length > 0
          ? buildCbtNewHref({
              classId,
              courseId,
              programId: data?.class?.program_id,
              schoolId: data?.class?.school_id,
              lessonPlanId: plan?.id ?? null,
              lessonId: lesson?.id || null,
              curriculumId: plan?.curriculum_version_id,
              week,
              topic: taughtBrief.topic,
              title: taughtBrief.title,
              examType: taughtBrief.examType,
              source: taughtBrief.sourceMaterial,
              sit: taughtBrief.sit,
              hostAssessment: taughtBrief.kind,
            })
          : undefined;
      return {
        ...row,
        meetingsInWeek: meetingCountByWeek.get(week) ?? 1,
        slotLabel,
        timetableSessionId,
        manualLessonHref,
        liveSessionHref,
        attendanceHref,
        taughtAssessmentHref,
        taughtTopicCount: taughtBrief?.topics.length ?? 0,
        hostSit: sit,
        hostPaperName: taughtBrief?.kind ? hostPaperLabel(taughtBrief.kind) : null,
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
    data?.timetable_sessions,
    data?.programme_policy,
    data?.term_activities,
    data?.class?.academic_terms?.start_date,
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
  const workflow = summarizeTeachingWorkflow(weekRows);

  useEffect(() => {
    onAttentionChange?.({
      weeksNeedingWork,
      weeksFullyLive,
      planned: weekRows.length,
      missingContent: workflow.missingContent,
      readyToShare: workflow.readyToShare,
    });
  }, [
    onAttentionChange,
    weekRows.length,
    weeksFullyLive,
    weeksNeedingWork,
    workflow.missingContent,
    workflow.readyToShare,
  ]);

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

  useEffect(() => {
    const target = document.getElementById("next-teacher-action");
    if (!target || typeof IntersectionObserver === "undefined") {
      setNextActionInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setNextActionInView(entry.isIntersecting),
      { threshold: 0.15, rootMargin: "-4rem 0px -5rem 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [resumeWeek?.rowKey]);

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

  function revealWeek(rowKey: string) {
    setWeekFilter("all");
    setTermFilter(0);
    setSearchQuery("");
    window.setTimeout(() => scrollToWeek(rowKey), 80);
  }

  return (
    <div className="space-y-4">
      {isSpecialProgram && data?.class?.academic_offerings ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-lg text-amber-600 dark:text-amber-300">
              ✨
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                  Special programme
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
              Programme settings
            </Link>
          </div>
        </div>
      ) : null}

      {/* Course & Official Direction Header */}
      <div className="rounded-2xl border border-border/80 bg-card/60 p-3.5 sm:p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            {canManageCurriculum ? (
              <SmartCourseSelect
                label="Course assigned to this class"
                labelClass="text-xs font-bold text-muted-foreground flex items-center gap-1.5"
                classId={classId}
                value={courseId}
                disabled={busy}
                onChange={(id) => void chooseCourse(id)}
              />
            ) : (
              <div>
                <p className="text-xs font-bold text-muted-foreground">Course being taught</p>
                <div className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="truncate text-sm font-bold text-foreground">
                    {selectedCourse?.title || "No course assigned"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Managed by your Academic Office.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 text-xs font-bold text-muted-foreground">
            Approved curriculum
            <div className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 shadow-inner">
              {officialDirection ? (
                <>
                  <p className="truncate text-sm font-bold text-foreground">
                    {officialDirection}
                  </p>
                  <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                    Supplies the topics used for every teaching session in this class.
                  </p>
                </>
              ) : (
                <p className="text-sm font-normal text-muted-foreground">
                  {courseId
                    ? "No approved curriculum is assigned yet. An administrator must complete this before delivery can begin."
                    : "Select a course first."}
                </p>
              )}
            </div>
          </div>
          {canManageCurriculum && courseId && planStage?.state !== "blocked" && !plan && (
            <button
              disabled={busy}
              onClick={() =>
                void act({ action: "ensure_plan", course_id: courseId })
              }
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              Create teaching sessions
            </button>
          )}
          {canManageCurriculum && courseId && plan && (
            <button
              disabled={busy}
              onClick={() =>
                void act({ action: "ensure_plan", course_id: courseId })
              }
              className="text-xs font-bold text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              title="Re-reads the official weeks for this class. Lessons already taught stay as they are."
            >
              Check curriculum updates
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
              turn into a class plan.
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
        <BodyPortal>
          <div
            className="app-fixed-overlay mobile-native-dialog fixed inset-0 z-[200] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget && !busy) setPendingRelease(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="package-confirm-title"
              onClick={(event) => event.stopPropagation()}
              className={`max-h-[calc(100dvh-var(--safe-area-top))] w-full overflow-y-auto rounded-t-3xl border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-3xl sm:pb-5 ${
              pendingRelease.mode === "hold"
                ? "border-amber-500/40 bg-background"
                : "border-orange-500/40 bg-background"
            }`}
            >
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                pendingRelease.mode === "hold"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
              }`}>
                {pendingRelease.mode === "hold" ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <RocketLaunchIcon className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p id="package-confirm-title" className="text-base font-black text-foreground">
                  {pendingRelease.mode === "hold"
                    ? "Hold this package from students?"
                    : "Share this complete package?"}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {pendingRelease.label}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPendingRelease(null);
                }}
                aria-label="Close review"
                className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {pendingRelease.mode === "hold" ? "What changes" : "Students will receive"}
              </p>
              <p className="mt-1 text-xs leading-5 text-foreground/80">
                {pendingRelease.mode === "hold"
                  ? "Lesson, slides, practice cards, assignment and project will be held together. Existing submissions, scores, attendance and delivery history remain safe."
                  : "Lesson, slides, practice cards, assignment and project will become visible together. Assessments remain private until you open them separately."}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPendingRelease(null);
                }}
                className="min-h-11 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black text-muted-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmPendingRelease()}
                className={`min-h-11 rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:opacity-50 ${
                  pendingRelease.mode === "hold" ? "bg-amber-700" : "bg-orange-700"
                }`}
              >
                {busy
                  ? "Saving…"
                  : pendingRelease.mode === "hold"
                    ? "Hold package"
                    : "Share with students"}
              </button>
            </div>
            </div>
          </div>
        </BodyPortal>
      )}

      {canEdit && !pendingRelease && resumeWeek && !nextActionInView && (
          <div className="fixed inset-x-3 bottom-[calc(var(--app-bottom-nav-height)+var(--app-sticky-actions-height)+0.75rem)] z-[65] md:hidden">
            {resumeWeek.recommendedAction === "release" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setPendingRelease({
                  label: `${teachingMeetingLabel(
                    resumeWeek.week,
                    resumeWeek.session,
                    resumeWeek.meetingsInWeek
                  )} will become visible to this class.`,
                  body: {
                    action: "release_week",
                    lesson_plan_id: plan?.id,
                    week_number: resumeWeek.week,
                    session: resumeWeek.session,
                  },
                })
              }
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-orange-400/50 bg-orange-700 px-4 py-3 text-left text-white shadow-2xl shadow-black/30 disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-widest text-orange-100">
                  Ready for your review
                </span>
                <span className="mt-0.5 block truncate text-xs font-black">
                  {teachingMeetingLabel(
                    resumeWeek.week,
                    resumeWeek.session,
                    resumeWeek.meetingsInWeek
                  )}: {resumeWeek.topic}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-black">
                Review <RocketLaunchIcon className="h-4 w-4" />
              </span>
            </button>
            ) : resumeWeek.recommendedAction === "prepare" || resumeWeek.recommendedAction === "refresh" ? (
              <button
                type="button"
                disabled={busy || aiBusy || !planReady}
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
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-violet-400/50 bg-violet-700 px-4 py-3 text-left text-white shadow-2xl shadow-black/30 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-violet-100">
                    {resumeWeek.recommendedAction === "refresh" ? "Curriculum changed" : "Content gap detected"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-black">
                    {teachingMeetingLabel(resumeWeek.week, resumeWeek.session, resumeWeek.meetingsInWeek)}: {resumeWeek.topic}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-black">
                  {resumeWeek.recommendedAction === "refresh" ? "Update" : "Fill gaps"}
                  <SparklesIcon className="h-4 w-4" />
                </span>
              </button>
            ) : resumeWeek.lesson ? (
              <Link
                href={`/dashboard/lessons/${resumeWeek.lesson.id}`}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary px-4 py-3 text-left text-primary-foreground shadow-2xl shadow-black/30"
              >
                <span className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-primary-foreground/80">
                    Ready to teach
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-black">
                    {teachingMeetingLabel(resumeWeek.week, resumeWeek.session, resumeWeek.meetingsInWeek)}: {resumeWeek.topic}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-black">
                  Open <BookOpenIcon className="h-4 w-4" />
                </span>
              </Link>
            ) : null}
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

      {aiStatus && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${
            aiStatus.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : aiStatus.tone === "warning"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
          }`}
        >
          {aiStatus.tone === "progress" ? (
            <ArrowPathIcon className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
          )}
          <span className="font-semibold">{aiStatus.message}</span>
        </div>
      )}

      {plan &&
        preparationStatus?.available &&
        (preparationStatus.state === "running" ||
          preparationStatus.state === "attention") && (
        <div
          className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
            preparationStatus.state === "attention"
              ? "border-amber-500/30 bg-amber-500/10"
              : preparationStatus.state === "running"
                ? "border-violet-500/30 bg-violet-500/10"
                : "border-border bg-card/60"
          }`}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            {preparationStatus.state === "running" ? (
              <ArrowPathIcon className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-600 dark:text-violet-300" />
            ) : preparationStatus.state === "attention" ? (
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            ) : (
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">
                {preparationStatus.state === "running"
                  ? "Content preparation is in progress"
                  : "Content preparation needs attention"}
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                {preparationStatus.message}
              </p>
            </div>
          </div>
          {canEdit && preparationStatus.state === "attention" && (
            <button
              type="button"
              disabled={busy || aiBusy || !planReady}
              onClick={() => void generateMissingPackages()}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
            >
              <SparklesIcon className="h-4 w-4" />
              Retry missing content
            </button>
          )}
        </div>
      )}

      {busy && !data && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin text-primary" />
          Loading class plan…
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
          <p className="mt-3 text-base font-black">Teaching sessions have not been created</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            An administrator creates them once from the approved curriculum. This does not generate lessons or share anything with students yet.
          </p>
          {canManageCurriculum && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act({ action: "ensure_plan", course_id: courseId })
              }
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              Create teaching sessions
            </button>
          )}
        </div>
      )}

      {plan && (
        <>
          <section
            id="teaching-workflow"
            aria-labelledby="teaching-flow-title"
            className="scroll-mt-24 rounded-2xl border border-border bg-background p-3.5 shadow-sm sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                  One connected workflow
                </p>
                <h3 id="teaching-flow-title" className="mt-1 text-base font-black text-foreground">
                  From approved curriculum to the classroom
                </h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                  The curriculum supplies the topics. The class plan turns them into teaching sessions. The assistant fills missing learning materials, you review each complete package, then students receive it and teaching is recorded.
                </p>
              </div>
              {canManageCurriculum && (
                <Link
                  href={buildLessonPlanHref(plan.id)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-foreground transition-colors hover:border-primary/40"
                >
                  Edit curriculum mapping
                </Link>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                {
                  key: "plan",
                  number: "1",
                  title: "Curriculum → sessions",
                  detail: `${workflow.curriculumWeeks} curriculum week${workflow.curriculumWeeks === 1 ? "" : "s"} expanded into ${workflow.totalSessions} teaching session${workflow.totalSessions === 1 ? "" : "s"}.`,
                  active: false,
                },
                {
                  key: "prepare",
                  number: "2",
                  title: "Prepare content",
                  detail: workflow.missingContent > 0
                    ? `${workflow.missingContent} session${workflow.missingContent === 1 ? "" : "s"} still need one or more learning items.`
                    : "Every session has its five core learning items.",
                  active: workflow.nextStage === "prepare",
                },
                {
                  key: "review",
                  number: "3",
                  title: "Review and share",
                  detail: workflow.readyToShare > 0
                    ? `${workflow.readyToShare} complete package${workflow.readyToShare === 1 ? " is" : "s are"} waiting for teacher review.`
                    : `${workflow.shared} package${workflow.shared === 1 ? " is" : "s are"} currently shared with students.`,
                  active: workflow.nextStage === "review",
                },
                {
                  key: "teach",
                  number: "4",
                  title: "Teach and record",
                  detail: `${workflow.taught} of ${workflow.totalSessions} session${workflow.totalSessions === 1 ? "" : "s"} recorded as taught. Attendance and results stay linked to this class.`,
                  active: workflow.nextStage === "teach" || workflow.nextStage === "complete",
                },
              ].map((step) => (
                <div
                  key={step.key}
                  className={`min-w-0 rounded-xl border p-3 ${
                    step.active
                      ? "border-primary/40 bg-primary/10 shadow-sm"
                      : "border-border bg-card/60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                      step.active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {step.number}
                    </span>
                    <p className="text-xs font-black text-foreground">{step.title}</p>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{step.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-5 text-foreground/80">
                <span className="font-black text-foreground">How automation behaves:</span>{" "}
                whether a teacher or the assistant completes an item, it is saved in this same teaching session. Completed and teacher-edited work is kept; only genuine gaps are filled.
                {data?.auto_generate?.auto_publish
                  ? " Automatic sharing is enabled for complete packages."
                  : " Students see nothing until a teacher shares the complete package."}
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
              {canEdit && workflow.missingContent > 0 && (
                <button
                  type="button"
                  disabled={busy || aiBusy || !planReady}
                  onClick={() => void generateMissingPackages()}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {aiBusy ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="h-4 w-4" />
                  )}
                  {workflow.missingItems > 0
                    ? `Fill ${workflow.missingItems} missing item${workflow.missingItems === 1 ? "" : "s"}`
                    : "Update changed items"}
                </button>
              )}
              {workflow.readyToShare > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("next-teacher-action")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-xs font-black text-orange-800 transition-colors hover:bg-orange-500/20 dark:text-orange-200"
                >
                  <RocketLaunchIcon className="h-4 w-4" />
                  Review next package
                </button>
              )}
              </div>
            </div>
          </section>

          {/* Up Next / Command Hero Card */}
          {resumeWeek && (
            <div
              id="next-teacher-action"
              className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-background p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      Next teacher action
                    </span>
                    <span className="rounded-full border border-border bg-background/80 px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                      {teachingMeetingLabel(
                        resumeWeek.week,
                        resumeWeek.session,
                        resumeWeek.meetingsInWeek
                      )}
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
                    <span>
                      Core package: {resumeWeek.packageStatus.readyCount} of 5 ready
                    </span>
                    <span>•</span>
                    <span className={
                      resumeWeek.visibilitySummary.needsRelease
                        ? "font-semibold text-orange-600 dark:text-orange-400"
                        : resumeWeek.packageStatus.complete
                        ? "font-semibold text-emerald-600 dark:text-emerald-400"
                        : "font-semibold text-amber-600 dark:text-amber-400"
                    }>
                      {resumeWeek.visibilitySummary.needsRelease
                        ? "Complete package ready for your review"
                        : resumeWeek.packageStatus.complete
                        ? "Ready for class"
                        : `${resumeWeek.packageStatus.missing.length} learning items still needed`}
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
                          label: `${teachingMeetingLabel(
                            resumeWeek.week,
                            resumeWeek.session,
                            resumeWeek.meetingsInWeek
                          )} will become visible to this class.`,
                          body: {
                            action: "release_week",
                            lesson_plan_id: plan.id,
                            week_number: resumeWeek.week,
                            session: resumeWeek.session,
                          },
                        })
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-700 hover:bg-orange-800 px-5 py-2.5 text-xs font-black text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <RocketLaunchIcon className="h-4 w-4" />
                      Review & share {teachingMeetingLabel(
                        resumeWeek.week,
                        resumeWeek.session,
                        resumeWeek.meetingsInWeek
                      )}
                    </button>
                  )}

                  {resumeWeek.lesson && resumeWeek.recommendedAction === "teach" && (
                    <>
                      <Link
                        href={`/dashboard/lessons/${resumeWeek.lesson.id}`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-5 py-2.5 text-xs font-black text-primary-foreground shadow-md transition-all active:scale-[0.98]"
                      >
                        <BookOpenIcon className="h-4 w-4" />
                        Open class materials
                      </Link>
                      {canEdit && (
                        <>
                          <Link
                            href={resumeWeek.attendanceHref}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-xs font-black text-primary shadow-sm transition-all active:scale-[0.98]"
                          >
                            <ClipboardDocumentCheckIcon className="h-4 w-4" />
                            Take attendance
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setPendingRelease({
                                mode: "hold",
                                label: `${teachingMeetingLabel(
                                  resumeWeek.week,
                                  resumeWeek.session,
                                  resumeWeek.meetingsInWeek
                                )} will no longer be visible to this class.`,
                                body: {
                                  action: "hold_week",
                                  lesson_plan_id: plan.id,
                                  week_number: resumeWeek.week,
                                  session: resumeWeek.session,
                                },
                              })
                            }
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300"
                          >
                            <EyeSlashIcon className="h-4 w-4" />
                            Hold from students
                          </button>
                        </>
                      )}
                    </>
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
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-500 px-4 py-2.5 text-xs font-black text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <SparklesIcon className="h-4 w-4" />
                      {resumeWeek.recommendedAction === "refresh"
                        ? "Update changed items"
                        : `Let assistant fill ${resumeWeek.packageStatus.missing.length} missing item${resumeWeek.packageStatus.missing.length === 1 ? "" : "s"}`}
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

              <div className="mt-4 border-t border-primary/15 pt-4">
                <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-foreground">
                      Content for this teaching session
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                      These five items belong to the same session. Open any item to check or edit it, then share all five together.
                    </p>
                  </div>
                  {resumeWeek.visibilitySummary.needsRelease && (
                    <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-black text-orange-700 dark:text-orange-300">
                      Waiting for your review
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <AssetCardTile
                    label="Lesson"
                    itemTitle={resumeWeek.lesson?.title}
                    icon={BookOpenIcon}
                    state={resumeWeek.visibility.lesson}
                    href={resumeWeek.lesson ? `/dashboard/lessons/${resumeWeek.lesson.id}` : canEdit ? resumeWeek.manualLessonHref : undefined}
                    actionLabel={resumeWeek.lesson ? "Open lesson" : "Create lesson"}
                  />
                  <AssetCardTile
                    label="Slides"
                    itemTitle={resumeWeek.slideDeck?.title}
                    icon={PresentationChartLineIcon}
                    state={resumeWeek.visibility.slides}
                    href={
                      resumeWeek.lesson
                        ? buildLessonSlidesHref({
                            lessonId: resumeWeek.lesson.id,
                            returnClassId: classId,
                          })
                        : undefined
                    }
                    actionLabel={
                      resumeWeek.slideDeck
                        ? "Open slides"
                        : resumeWeek.lesson
                          ? "Add slides"
                          : "Create lesson first"
                    }
                  />
                  <AssetCardTile
                    label="Practice cards"
                    itemTitle={resumeWeek.flashcardDeck?.title}
                    icon={BoltIcon}
                    state={resumeWeek.visibility.flashcards}
                    href={
                      resumeWeek.flashcardDeck
                        ? buildFlashcardsHref({
                            deckId: resumeWeek.flashcardDeck.id,
                            classId,
                            courseId,
                            lessonId: resumeWeek.lesson?.id || null,
                            lessonPlanId: plan.id,
                            topic: resumeWeek.topic,
                          })
                        : undefined
                    }
                    onClick={
                      !resumeWeek.flashcardDeck && canEdit
                        ? () => void createFlashcardDeck(resumeWeek.lesson || resumeWeek.weekMeta, resumeWeek.week)
                        : undefined
                    }
                    actionLabel={resumeWeek.flashcardDeck ? "Open cards" : "Create cards"}
                  />
                  <AssetCardTile
                    label="Assignment"
                    itemTitle={resumeWeek.assignment?.title}
                    icon={ClipboardDocumentListIcon}
                    state={resumeWeek.visibility.assignment}
                    href={
                      resumeWeek.assignment
                        ? `/dashboard/assignments/${resumeWeek.assignment.id}`
                        : canEdit
                          ? buildAssignmentNewHref({
                              classId,
                              courseId,
                              lessonPlanId: plan.id,
                              lessonId: resumeWeek.lesson?.id || null,
                              week: resumeWeek.week,
                            })
                          : undefined
                    }
                    actionLabel={resumeWeek.assignment ? "Open assignment" : "Create assignment"}
                  />
                  <AssetCardTile
                    label="Project"
                    itemTitle={resumeWeek.project?.title}
                    icon={RocketLaunchIcon}
                    state={resumeWeek.visibility.project}
                    href={
                      resumeWeek.project
                        ? `/dashboard/projects/${resumeWeek.project.id}`
                        : canEdit
                          ? buildProjectNewHref({
                              classId,
                              courseId,
                              schoolId: data?.class?.school_id,
                              lessonPlanId: plan.id,
                              lessonId: resumeWeek.lesson?.id || null,
                              week: resumeWeek.week,
                            })
                          : undefined
                    }
                    actionLabel={resumeWeek.project ? "Open project" : "Create project"}
                  />
                </div>
                {!resumeWeek.packageStatus.complete && (
                  <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:text-amber-200">
                    <span className="font-black">Prefer to handle it yourself?</span>{" "}
                    Select any missing item above. Manual work and assistant work use this same teaching session, so completed items are kept and will not be generated again.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* A plan problem remains explicit; normal administrator controls stay in the workflow header. */}
          <div>
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

          </div>

          {/* Cross-class records stay available without becoming a second tab bar. */}
          <details className="rounded-xl border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-xs font-black text-foreground">
                  Class records and results
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Coverage, assessments, grading and results
                </span>
              </span>
              <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </summary>
            <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  label: "Coverage",
                  href: buildCoverageHref({
                    classId,
                    courseId,
                  }),
                },
                {
                  label: "Assessments",
                  href: buildClassAssessmentHref({ classId, courseId }),
                },
                { label: "Grading", href: buildGradesHref({ classId, courseId }) },
                { label: "Results", href: buildResultsHref({ classId, courseId }) },
                { label: "Cross-class review queue", href: "/dashboard/teaching/approvals" },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground transition-colors hover:border-primary/40"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>

          {/* Main Teaching Packages Hub */}
          <div className="rounded-2xl border border-border bg-background p-3.5 sm:p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-black text-foreground">
                  Teaching sessions
                </h3>
                <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                  {data?.programme_policy?.usesHostEvaluation
                    ? `Teaching follows this school's calendar. First Test, Second Test and Examination are the official assessments; Rillcod still prepares the lesson materials for teaching weeks.`
                    : "Lessons, practice and Rillcod assessments feed the same class record and term result."}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Every session shows its lesson, slides, practice cards, assignment and project below. Open an item to review it, then share the complete package here. Assessment stays separate because a school may use its own paper or CBT.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-black text-primary">
                    {data?.programme_policy?.usesHostEvaluation ? "School assessments" : "Rillcod assessments"}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                    {`${data?.programme_policy?.sessionsPerWeek ?? 1} teaching session${data?.programme_policy?.sessionsPerWeek === 1 ? "" : "s"} / week`}
                  </span>
                </div>
              </div>
              <span className="w-fit rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                Prepare · review · share here
              </span>
            </div>

            {/* A read-only curriculum journey belongs in delivery. Teachers can see the
                whole approved sequence here without entering the administrator editor. */}
            {weekRows.length > 0 && (
              <section className="mt-4 border-t border-border/60 pt-4" aria-labelledby="curriculum-journey-title">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h4 id="curriculum-journey-title" className="text-xs font-black text-foreground">
                      Approved curriculum journey
                    </h4>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Every topic in teaching order. Select a card to open its full package below.
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
                    {workflow.curriculumWeeks} weeks · {workflow.totalSessions} sessions
                  </span>
                </div>
                <div
                  className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 scrollbar-none [-webkit-overflow-scrolling:touch]"
                  style={{ scrollbarWidth: "none" }}
                >
                  {weekRows.map((row) => {
                    const isTaught = row.taught;
                    const isReady = row.packageStatus.complete;
                    const isHeld = row.visibilitySummary.needsRelease;
                    const status = isTaught
                      ? "Taught"
                      : isHeld
                      ? "Ready to review"
                      : isReady
                      ? "Shared with students"
                      : `${row.packageStatus.missing.length} item${row.packageStatus.missing.length === 1 ? "" : "s"} missing`;
                    const statusClass = isTaught
                      ? "text-emerald-700 dark:text-emerald-300"
                      : isHeld
                        ? "text-orange-700 dark:text-orange-300"
                        : isReady
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-amber-700 dark:text-amber-300";
                    return (
                      <button
                        key={row.rowKey}
                        type="button"
                        onClick={() => revealWeek(row.rowKey)}
                        aria-label={`Open ${teachingMeetingLabel(row.week, row.session, row.meetingsInWeek)}: ${row.topic}. ${status}`}
                        className="group flex min-h-32 w-[78vw] max-w-64 shrink-0 snap-start flex-col rounded-xl border border-border bg-card/80 p-3 text-left transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] sm:w-56"
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                          {teachingMeetingShortLabel(
                            row.week,
                            row.session,
                            row.meetingsInWeek
                          )}
                        </span>
                        <span className="mt-1 line-clamp-2 text-sm font-black leading-snug text-foreground">
                          {row.topic}
                        </span>
                        <span className={`mt-auto pt-3 text-[10px] font-black ${statusClass}`}>
                          {status}
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground">
                          {row.packageStatus.readyCount} of 5 learning items ready
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">
                  Swipe sideways to see every curriculum session.
                </p>
              </section>
            )}

            {/* Filter Bar, Term Selector, and Topic Search Input */}
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ["all", `All (${weekRows.length})`],
                    ["todo", `Needs attention (${weeksNeedingWork})`],
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
                    Review & share selected
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
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Each week shows how this class got it: generated here, copied from
              another class, or edited for this class.
            </p>
            <div className="mt-2 space-y-3">
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
                  calendarLabel,
                  calendarRole,
                  manualLessonHref,
                  liveSessionHref,
                  attendanceHref,
                  timetableSessionId,
                  slotLabel,
                  rowKey,
                  taughtAssessmentHref,
                  taughtTopicCount,
                  hostSit,
                  hostPaperName,
                } = row;

                const isExpanded = expandedCards.has(rowKey);

                const statusLabel = calendarLabel
                  ? calendarLabel
                  : !packageStatus.complete
                  ? `${packageStatus.missing.length} missing`
                  : visibilitySummary.needsRelease
                  ? "Not visible"
                  : taught
                  ? "Taught"
                  : "Visible";

                const statusClass = calendarLabel
                  ? "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300"
                  : !packageStatus.complete
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
                              aria-label={`Select ${slotLabel}`}
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
                              {slotLabel}
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
                            {provenance.origin ? (
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                  provenance.origin === "edited"
                                    ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                    : provenance.origin === "copied"
                                      ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                }`}
                              >
                                {WEEK_CONTENT_ORIGIN_LABEL[provenance.origin]}
                              </span>
                            ) : null}
                            {provenance.staleDerived && (
                              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                Updating learning items
                              </span>
                            )}
                          </div>

                          <h4 className="mt-1 text-sm font-black text-foreground sm:text-base leading-snug">
                            {topic}
                          </h4>

                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Core package: {packageStatus.readyCount} of 5 ready
                            {visibilitySummary.heldCount > 0
                              ? ` · ${visibilitySummary.heldCount} not visible to students`
                              : visibilitySummary.fullyLive
                              ? " · visible to class"
                              : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusClass}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>

                      {/* Interactive 5-Asset Segment Hub */}
                      <div className="mt-3.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
                        <AssetCardTile
                          label="Lesson"
                          itemTitle={lesson?.title}
                          icon={BookOpenIcon}
                          state={visibility.lesson}
                          href={lesson ? `/dashboard/lessons/${lesson.id}` : canEdit ? manualLessonHref : undefined}
                          actionLabel={lesson ? "Open lesson" : "Create lesson"}
                        />
                        <AssetCardTile
                          label="Slides"
                          itemTitle={slideDeck?.title}
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
                          actionLabel={slideDeck ? "Open slides" : lesson ? "Add slides" : "Create lesson first"}
                        />
                        <AssetCardTile
                          label="Practice cards"
                          itemTitle={flashcardDeck?.title}
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
                          actionLabel={flashcardDeck ? "Open cards" : "Create cards"}
                        />
                        <AssetCardTile
                          label="Assignment"
                          itemTitle={assignment?.title}
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
                          actionLabel={assignment ? "Open assignment" : "Create assignment"}
                        />
                        <AssetCardTile
                          label="Project"
                          itemTitle={project?.title}
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
                          actionLabel={project ? "Open project" : "Create project"}
                        />
                        {!data?.programme_policy?.usesHostEvaluation ? (
                        <AssetCardTile
                          label="Assessment"
                          itemTitle={evaluation?.title}
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
                          actionLabel={evaluation ? "Open assessment" : "Create assessment"}
                        />
                        ) : isHostAssessmentWeek(calendarRole) ? (
                        <AssetCardTile
                          label={hostPaperName || (hostSit === "cbt" ? "CBT exam" : "Paper")}
                          itemTitle={evaluation?.title}
                          icon={DocumentChartBarIcon}
                          state={
                            evaluation
                              ? evaluationStatus
                              : taughtTopicCount > 0
                              ? "held"
                              : "missing"
                          }
                          href={
                            evaluation
                              ? `/dashboard/cbt/${evaluation.id}`
                              : canEdit
                              ? taughtAssessmentHref
                              : undefined
                          }
                          actionLabel={
                            evaluation
                              ? hostSit === "cbt"
                                ? "Open"
                                : "Print"
                              : taughtTopicCount > 0
                              ? "Generate"
                              : "Teach first"
                          }
                        />
                        ) : (
                          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">First Test, Second Test and Examination</p>
                            <p className="mt-1 text-[11px] font-semibold text-foreground">Generated from taught weeks when that paper’s week arrives. No extra typing.</p>
                          </div>
                        )}
                      </div>

                      {!packageStatus.complete && (
                        <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:text-amber-200">
                          <span className="font-black">Two ways to finish:</span>{" "}
                          let the assistant fill only the missing items, or select a missing item above to create it yourself. Both paths update this same session and keep completed work.
                        </p>
                      )}

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
                                  label: `${slotLabel} will become visible to this class.`,
                                  body: {
                                    action: "release_week",
                                    lesson_plan_id: plan.id,
                                    week_number: week,
                                    session,
                                  },
                                })
                              }
                              className="inline-flex min-h-10 flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-orange-700 hover:bg-orange-800 px-4 py-2 text-xs font-black text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
                            >
                              <RocketLaunchIcon className="h-4 w-4" />
                              Review & share
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

                          {canEdit && recommendedAction === "teach" && (
                            <Link
                              href={attendanceHref}
                              className="inline-flex min-h-10 flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-black text-primary shadow-sm transition-transform active:scale-[0.98]"
                            >
                              <ClipboardDocumentCheckIcon className="h-4 w-4" />
                              Take attendance
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
                                ? "Update changed items"
                                : `Let assistant fill ${packageStatus.missing.length} missing item${packageStatus.missing.length === 1 ? "" : "s"}`}
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
                            <>
                              <Link
                                href={liveSessionHref}
                                title="Start a live online class if this meeting is remote"
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[11px] font-bold text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                              >
                                <VideoCameraIcon className="h-3.5 w-3.5 text-primary" />
                                <span className="hidden sm:inline">Live Class</span>
                              </Link>
                              <button
                                type="button"
                                disabled={busy}
                                title="Temporarily withdraw this complete package without deleting learner work"
                                onClick={() =>
                                  setPendingRelease({
                                    mode: "hold",
                                    label: `${slotLabel} will no longer be visible to this class.`,
                                    body: {
                                      action: "hold_week",
                                      lesson_plan_id: plan.id,
                                      week_number: week,
                                      session,
                                    },
                                  })
                                }
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
                              >
                                <EyeSlashIcon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Hold</span>
                              </button>
                            </>
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
                                  session,
                                  lesson_id: lesson?.id || null,
                                  status: "delivered",
                                  class_session_id: timetableSessionId,
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
                            title={isExpanded ? "Hide editing tools" : "Show editing tools"}
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
                          Edit individual learning items
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
                          ) : canEdit && taughtAssessmentHref ? (
                            <Link
                              href={taughtAssessmentHref}
                              className={toolLinkClass}
                            >
                              Generate {hostPaperName || "paper"} +
                            </Link>
                          ) : canEdit && !data?.programme_policy?.usesHostEvaluation ? (
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
                    academic direction, or open Advanced plan tools to add
                    weeks by hand.
                  </p>
                  <Link
                    href={buildLessonPlanHref(plan.id)}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-black text-foreground transition-colors hover:border-primary/40"
                  >
                    Advanced plan tools
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

function AssetCardTile({
  label,
  itemTitle,
  icon: Icon,
  state,
  href,
  onClick,
  actionLabel,
}: {
  label: string;
  itemTitle?: string | null;
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
      className={`group flex min-h-[5.75rem] flex-col justify-between rounded-xl border p-2.5 text-left transition-all duration-150 ${colorClass} ${
        href || onClick ? "hover:border-primary/50 hover:shadow-xs active:scale-95 cursor-pointer" : ""
      }`}
      title={`${label}: ${isLive ? "Visible to students" : isHeld ? "Prepared · Not visible to students" : "Missing"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className="truncate text-[10px] font-black uppercase tracking-wide">{label}</span>
        </span>
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
      </div>
      <div className="mt-2 min-w-0">
        <p className="line-clamp-2 text-[11px] font-bold leading-4 text-foreground">
          {itemTitle?.trim() || (isMissing ? "Not prepared yet" : `${label} ready`)}
        </p>
        <p className="mt-1 text-[9px] font-black uppercase tracking-wide opacity-75">
          {isLive ? "Shared with students" : isHeld ? "Ready for review" : actionLabel || "Add"}
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
