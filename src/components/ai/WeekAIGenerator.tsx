"use client";

/**
 * WeekAIGenerator
 * ───────────────
 * One-click week prep UI for a class teaching plan.
 *
 * Generation is delegated to POST /api/lesson-plans/[id]/generate-week, which
 * runs generatePlanWeek — the same central pipeline the nightly
 * auto-generate-content sweep uses. Publish vs hold comes from the plan's
 * auto_generate_settings. Do not re-implement generators here.
 */

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { validateLessonPlanForGeneration } from "@/lib/api-guards";
import { useOverlayScrollLock } from "@/components/ui/BodyPortal";
import {
  SparklesIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  BoltIcon,
  BookOpenIcon,
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
  RocketLaunchIcon,
} from "@/lib/icons";

// ── Types ────────────────────────────────────────────────────────────────────

interface Week {
  week: number;
  /** Class meeting within the week — set for programmes that meet more than once. */
  session?: number | null;
  session_number?: number | null;
  topic: string;
  objectives?: string;
  activities?: string;
  notes?: string;
  assignment?: { title?: string; brief?: string };
  project?: { title?: string; description?: string };
}

interface ExistingContent {
  lessonId?: string;
  slideDeckId?: string;
  deckId?: string;
  assignmentId?: string;
  projectId?: string;
}

interface Props {
  week: Week;
  planId: string;
  /** Only needed for the flashcard deck and lesson-block assignment. Course,
   *  programme, grade and curriculum context now come from the plan itself,
   *  server-side, so they are no longer passed in. */
  courseId?: string | null;
  classId?: string | null;
  /** Pre-loaded linked content from parent state — used for dedup check. */
  existing?: ExistingContent;
  onDone?: (result: {
    lessonId?: string;
    slideDeckId?: string;
    deckId?: string;
    assignmentId?: string;
    projectId?: string;
  }) => void;
  onClose: () => void;
}

type StepState = "pending" | "active" | "done" | "skipped" | "error";

interface StepStatus {
  lesson: StepState;
  slides: StepState;
  flashcard: StepState;
  assignment: StepState;
  project: StepState;
}

interface Result {
  lessonId?: string;
  lessonTitle?: string;
  slideDeckId?: string;
  slideDeckTitle?: string;
  deckId?: string;
  deckTitle?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  projectId?: string;
  projectTitle?: string;
  skipped: string[];
}

// ── Helper ───────────────────────────────────────────────────────────────────

function humanStepState(state: StepState): string {
  if (state === "done") return "Ready";
  if (state === "active") return "Working…";
  if (state === "error") return "Needs a retry";
  if (state === "skipped") return "Already there";
  return "Waiting";
}

function StepRow({
  icon: Icon,
  label,
  sub,
  state,
  color,
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
  state: StepState;
  color: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-300 ${
        state === "done"
          ? "bg-emerald-500/10 border-emerald-500/20"
          : state === "active"
          ? "bg-primary/10 border-primary/30 ring-2 ring-primary/20"
          : state === "error"
          ? "bg-rose-500/10 border-rose-500/20"
          : state === "skipped"
          ? "bg-muted/20 border-border opacity-70"
          : "bg-muted/30 border-border"
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-inner ${color}`}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-black ${
            state === "done"
              ? "text-emerald-700 dark:text-emerald-300"
              : state === "error"
              ? "text-rose-700 dark:text-rose-300"
              : state === "active"
              ? "text-foreground"
              : "text-muted-foreground"
          }`}
        >
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground/80">
          {state === "active" ? "In progress right now" : sub}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {state === "done" && (
          <CheckCircleIcon className="ml-auto w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        )}
        {state === "active" && (
          <ArrowPathIcon className="ml-auto w-4 h-4 text-primary animate-spin" />
        )}
        {state === "error" && (
          <XMarkIcon className="ml-auto w-4 h-4 text-rose-600 dark:text-rose-400" />
        )}
        {(state === "skipped" || state === "pending") && (
          <span className="text-[9px] font-bold text-muted-foreground">
            {humanStepState(state)}
          </span>
        )}
      </div>
    </div>
  );
}

function LiveEventFeed({
  events,
  liveMessage,
  progress,
}: {
  events: string[];
  liveMessage: string | null;
  progress: number;
}) {
  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">
          Live progress
        </p>
        <p className="text-xs font-medium tabular-nums text-muted-foreground">
          {Math.round(progress)}%
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 via-primary to-fuchsia-500 transition-all duration-500"
          style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
        />
      </div>
      {liveMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-background/70 px-3 py-2.5">
          <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <p className="text-xs font-semibold leading-5 text-foreground">
            {liveMessage}
          </p>
        </div>
      )}
      {events.length > 0 && (
        <div className="max-h-28 space-y-1.5 overflow-y-auto overscroll-contain custom-scrollbar sm:max-h-40">
          {[...events].reverse().slice(0, 12).map((event, i) => (
            <p
              key={`${events.length - i}-${event.slice(0, 24)}`}
              className="rounded-lg bg-background/50 px-2.5 py-1.5 text-[11px] leading-4 text-muted-foreground"
            >
              {event}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Readiness preflight.
 *
 * Every generator that reads the plan's syllabus refuses a draft plan. Without
 * this check the refusal arrives five times — once per step — so an unpublished
 * plan looked like five unrelated faults, and the one generator with no plan
 * gate (flashcards) succeeded in the middle of them. One check up front turns
 * that into a single fixable statement before anything runs.
 */
async function checkPlanReadiness(planId: string): Promise<{
  ready: boolean;
  status?: string;
  /** Carried so a publish bumps the real version instead of resetting it to 2. */
  version?: number;
  /** False when the block is something publishing cannot fix. */
  fixableByPublishing?: boolean;
  message?: string;
}> {
  try {
    const res = await fetch(`/api/lesson-plans/${planId}`);
    if (!res.ok) return { ready: true }; // Can't tell — let the generators speak.
    const { data } = await res.json();

    // Same function the generators enforce server-side. Re-deriving "is this
    // plan ready" here would be a second copy of the rule, and a rule written
    // twice is a rule enforced in neither.
    const block = validateLessonPlanForGeneration(data);
    const status = data?.status as string | undefined;
    const version =
      typeof data?.version === "number" ? (data.version as number) : undefined;

    if (!block) return { ready: true, status, version };
    return {
      ready: false,
      status,
      version,
      fixableByPublishing: block.reason === "not_published" && status === "draft",
      message: block.detail ?? block.error,
    };
  } catch {
    return { ready: true };
  }
}

async function publishPlan(planId: string, currentVersion?: number) {
  const res = await fetch(`/api/lesson-plans/${planId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "published",
      // Mirrors the plan page's own publish: bump from the version the plan
      // actually holds. Omitted entirely when unknown, so the server keeps it.
      ...(typeof currentVersion === "number"
        ? { version: currentVersion + 1 }
        : {}),
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(
      j.error === "Forbidden"
        ? "Your account cannot publish this plan — ask an admin or the plan owner."
        : j.error ?? "Could not publish this plan"
    );
  }
}

async function fetchLesson(
  planId: string,
  weekNum: number
): Promise<any | null> {
  try {
    const res = await fetch(`/api/lessons?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (
      (data ?? []).find(
        (l: any) =>
          Number(
            l.curriculum_week_number ??
              l.metadata?.week ??
              l.metadata?.week_number
          ) === weekNum
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Confirms each artifact actually exists before it is offered as a link.
 *
 * Every id here was previously trusted the moment a POST returned. That is not
 * the same as the thing existing: the flashcard deck id, for one, was recorded
 * when the deck row was created and kept even if card generation then threw —
 * so the panel offered "Open Flashcards" for an empty deck. A deck with no
 * cards, a slide deck the response merely mentioned, a lesson that failed to
 * save: none of those are content, and none of them should be linkable.
 *
 * Anything that cannot be confirmed present is dropped from the result.
 */
async function verifyArtifacts(
  planId: string,
  candidate: Result
): Promise<{ verified: Result; dropped: string[] }> {
  const dropped: string[] = [];
  const verified: Result = { skipped: candidate.skipped };

  const idsIn = async (url: string): Promise<Set<string>> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return new Set();
      const { data } = await res.json();
      return new Set((data ?? []).map((row: any) => String(row.id)));
    } catch {
      return new Set();
    }
  };

  const [lessonIds, assignmentIds, slideIds, deckOk] = await Promise.all([
    candidate.lessonId
      ? idsIn(`/api/lessons?lesson_plan_id=${planId}`)
      : Promise.resolve(new Set<string>()),
    candidate.assignmentId || candidate.projectId
      ? idsIn(`/api/assignments?lesson_plan_id=${planId}`)
      : Promise.resolve(new Set<string>()),
    candidate.slideDeckId
      ? idsIn(`/api/slide-decks`)
      : Promise.resolve(new Set<string>()),
    // A deck only counts as generated once it actually holds cards.
    candidate.deckId
      ? (async () => {
          try {
            const res = await fetch(
              `/api/flashcards/decks/${candidate.deckId}/cards`
            );
            if (!res.ok) return false;
            const { data } = await res.json();
            return Array.isArray(data) && data.length > 0;
          } catch {
            return false;
          }
        })()
      : Promise.resolve(false),
  ]);

  const keep = (
    key: keyof Result,
    id: string | undefined,
    present: boolean,
    label: string,
    title?: string,
    titleKey?: keyof Result
  ) => {
    if (!id) return;
    if (present) {
      (verified as any)[key] = id;
      if (titleKey && title) (verified as any)[titleKey] = title;
    } else {
      dropped.push(label);
    }
  };

  keep("lessonId", candidate.lessonId, lessonIds.has(String(candidate.lessonId)), "lesson", candidate.lessonTitle, "lessonTitle");
  keep("slideDeckId", candidate.slideDeckId, slideIds.has(String(candidate.slideDeckId)), "learning slides", candidate.slideDeckTitle, "slideDeckTitle");
  keep("deckId", candidate.deckId, deckOk, "flashcards", candidate.deckTitle, "deckTitle");
  keep("assignmentId", candidate.assignmentId, assignmentIds.has(String(candidate.assignmentId)), "assignment", candidate.assignmentTitle, "assignmentTitle");
  keep("projectId", candidate.projectId, assignmentIds.has(String(candidate.projectId)), "project", candidate.projectTitle, "projectTitle");

  return { verified, dropped };
}

async function checkExistingAssignment(
  planId: string,
  weekNum: number
): Promise<string | null> {
  try {
    const res = await fetch(`/api/assignments?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (
      (data ?? []).find(
        (a: any) =>
          Number(
            a.curriculum_week_number ??
              a.metadata?.week ??
              a.metadata?.week_number
          ) === weekNum && a.assignment_type !== "project"
      )?.id ?? null
    );
  } catch {
    return null;
  }
}

async function checkExistingProject(
  planId: string,
  weekNum: number
): Promise<string | null> {
  try {
    const res = await fetch(`/api/assignments?lesson_plan_id=${planId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return (
      (data ?? []).find(
        (a: any) =>
          Number(
            a.curriculum_week_number ??
              a.metadata?.week ??
              a.metadata?.week_number
          ) === weekNum && a.assignment_type === "project"
      )?.id ?? null
    );
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function WeekAIGenerator({
  week,
  planId,
  courseId,
  classId,
  existing,
  onDone,
  onClose,
}: Props) {
  const [status, setStatus] = useState<StepStatus>({
    lesson: "pending",
    slides: "pending",
    flashcard: "pending",
    assignment: "pending",
    project: "pending",
  });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result>({ skipped: [] });
  /** Set when the plan itself blocks generation — the teacher's call, not a failure. */
  const [blocked, setBlocked] = useState<{
    status?: string;
    message: string;
    version?: number;
    fixableByPublishing?: boolean;
  } | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Only admin and teacher may PATCH a plan's status; offering the button to a
  // school account would just produce a 403 the teacher cannot act on.
  const { profile } = useAuth();
  const canPublish = profile?.role === "admin" || profile?.role === "teacher";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useOverlayScrollLock(true);

  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const sheetY = useMotionValue(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const dismissSheet = () => {
    if (running) return;
    if (reduceMotion) {
      onClose();
      return;
    }
    const height = sheetRef.current?.offsetHeight ?? 480;
    void animate(sheetY, height + 24, {
      type: "tween",
      duration: 0.12,
      ease: [0.3, 0, 1, 1],
    }).then(() => onClose());
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !running) {
        event.preventDefault();
        dismissSheet();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, reduceMotion]);

  const addLog = (msg: string) => {
    setLiveMessage(msg);
    setLog((p) => [...p, msg]);
  };
  const setStep = (k: keyof StepStatus, v: StepState) =>
    setStatus((p) => ({ ...p, [k]: v }));

  const stepProgress = (() => {
    const values = Object.values(status);
    const finished = values.filter(
      (s) => s === "done" || s === "skipped" || s === "error"
    ).length;
    const activeBoost = values.some((s) => s === "active") ? 0.35 : 0;
    return ((finished + activeBoost) / values.length) * 100;
  })();

  /** Publish the plan, then run — the teacher chooses to continue, explicitly. */
  async function publishAndRun() {
    setPublishing(true);
    setError(null);
    try {
      await publishPlan(planId, blocked?.version);
      setBlocked(null);
      setPublishing(false);
      await run();
    } catch (e: any) {
      setPublishing(false);
      setError(e.message ?? "Could not publish this plan");
    }
  }

  async function run() {
    setRunning(true);
    setDone(false);
    setError(null);
    setBlocked(null);
    setLog([]);
    setLiveMessage("Getting ready for this week…");
    setResult({ skipped: [] });
    setStatus({
      lesson: "pending",
      slides: "pending",
      flashcard: "pending",
      assignment: "pending",
      project: "pending",
    });

    // Ask once whether this plan can generate at all, before spending anything.
    const readiness = await checkPlanReadiness(planId);
    if (!readiness.ready) {
      setBlocked({
        status: readiness.status,
        message: readiness.message!,
        version: readiness.version,
        fixableByPublishing: readiness.fixableByPublishing,
      });
      setRunning(false);
      setLiveMessage(null);
      return;
    }

    const res: Result = { skipped: [] };

    try {
      // One central pipeline — same as the nightly sweep and "Generate week".
      // Do not re-implement lesson/slides/flashcards/assignments here; that
      // drifted from generatePlanWeek and skipped hold-for-approval rules.
      addLog("Preparing this week through the academy pipeline…");
      setStep("lesson", "active");
      setStep("slides", "active");
      setStep("flashcard", "active");
      setStep("assignment", "active");
      setStep("project", "active");

      const sessionVal = Number((week as any)?.session ?? (week as any)?.session_number ?? 0);
      const genRes = await fetch(`/api/lesson-plans/${planId}/generate-week`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: week.week,
          ...(sessionVal > 0 ? { session: Math.floor(sessionVal) } : {}),
        }),
      });
      const genJson = await genRes.json().catch(() => ({}));
      if (!genRes.ok) {
        throw new Error(genJson.error || "Week preparation failed");
      }

      const byType = (genJson.byType ?? {}) as Record<
        string,
        { generated?: number; skipped?: number; error?: string }
      >;
      const stepForType: Record<string, keyof StepStatus> = {
        lessons: "lesson",
        slides: "slides",
        flashcards: "flashcard",
        assignments: "assignment",
        projects: "project",
      };
      const labelFor: Record<string, string> = {
        lessons: "Lesson",
        slides: "Slides",
        flashcards: "Flashcards",
        assignments: "Homework",
        projects: "Project",
      };

      for (const [type, step] of Object.entries(stepForType)) {
        const outcome = byType[type];
        if (!outcome) {
          setStep(step, "skipped");
          res.skipped.push(type);
          continue;
        }
        if (outcome.error) {
          setStep(step, "error");
          addLog(`${labelFor[type]}: ${outcome.error}`);
          continue;
        }
        if (Number(outcome.skipped) > 0 && Number(outcome.generated) === 0) {
          setStep(step, "skipped");
          res.skipped.push(type);
          addLog(`${labelFor[type]} already ready — keeping it.`);
          continue;
        }
        setStep(step, "done");
        addLog(`${labelFor[type]} prepared.`);
      }

      if (Array.isArray(genJson.failedTypes) && genJson.failedTypes.length) {
        addLog(
          `Still outstanding: ${genJson.failedTypes
            .map((t: string) => labelFor[t] ?? t)
            .join(", ")}`
        );
      }

      // Hydrate open-links from what the pipeline actually wrote.
      addLog("Double-checking everything saved correctly…");
      const lesson = await fetchLesson(planId, week.week);
      if (lesson?.id) {
        res.lessonId = lesson.id;
        res.lessonTitle = lesson.title;
      }
      const asnId =
        existing?.assignmentId ??
        (await checkExistingAssignment(planId, week.week));
      if (asnId) res.assignmentId = asnId;
      const projId =
        existing?.projectId ?? (await checkExistingProject(planId, week.week));
      if (projId) res.projectId = projId;
      if (existing?.slideDeckId) res.slideDeckId = existing.slideDeckId;
      if (existing?.deckId) {
        res.deckId = existing.deckId;
      } else {
        // Best-effort: pipeline may have created a held deck for this week.
        try {
          const decksRes = await fetch(
            `/api/flashcards/decks?lesson_id=${encodeURIComponent(res.lessonId ?? "")}`
          );
          const decksJson = await decksRes.json().catch(() => ({}));
          const match = (decksJson.data ?? []).find(
            (d: any) =>
              d.lesson_plan_id === planId &&
              Number(d.curriculum_week_number) === week.week
          );
          if (match?.id) {
            res.deckId = match.id;
            res.deckTitle = match.title;
          }
        } catch {
          /* non-fatal */
        }
      }

      const { verified, dropped } = await verifyArtifacts(planId, res);
      if (dropped.length > 0) {
        addLog(
          `These didn’t save properly, so they won’t open yet: ${dropped.join(", ")}`
        );
        const stepFor: Record<string, keyof StepStatus> = {
          lesson: "lesson",
          "learning slides": "slides",
          flashcards: "flashcard",
          assignment: "assignment",
          project: "project",
        };
        for (const label of dropped) {
          const step = stepFor[label];
          if (step) setStep(step, "error");
        }
      } else if (genJson.auto_publish) {
        addLog("All set — this week is live for students.");
      } else {
        addLog(
          "All set — held for your approval. Release it from Approvals when ready."
        );
      }

      setResult(verified);
      setDone(true);
      setLiveMessage("This week’s package is ready.");
      onDone?.({
        lessonId: verified.lessonId,
        slideDeckId: verified.slideDeckId,
        deckId: verified.deckId,
        assignmentId: verified.assignmentId,
        projectId: verified.projectId,
      });
    } catch (e: any) {
      setError(e.message);
      addLog(`Something went wrong: ${e.message}`);
      setStep("lesson", "error");
      setStep("slides", "error");
      setStep("flashcard", "error");
      setStep("assignment", "error");
      setStep("project", "error");
    } finally {
      setRunning(false);
    }
  }

  const hasResult = !!(
    result.lessonId ||
    result.slideDeckId ||
    result.deckId ||
    result.assignmentId ||
    result.projectId
  );

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Prepare week ${week.week}`}
    >
      <div
        className="absolute inset-0 bg-foreground/40 dark:bg-black/70"
        onClick={!running ? dismissSheet : undefined}
      />

      <motion.div
        ref={sheetRef}
        style={{ y: sheetY }}
        drag={!running && !reduceMotion ? "y" : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.06 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (running) return;
          const height = sheetRef.current?.offsetHeight ?? 480;
          if (
            info.velocity.y > 500 ||
            info.offset.y > Math.max(56, height * 0.2)
          ) {
            dismissSheet();
            return;
          }
          void animate(sheetY, 0, {
            type: "tween",
            duration: reduceMotion ? 0.01 : 0.1,
            ease: [0.2, 0, 0, 1],
          });
        }}
        className="relative flex w-full max-h-[min(92dvh,100%)] flex-col overflow-hidden rounded-t-[1.75rem] border border-border bg-card text-card-foreground shadow-[0_-8px_32px_rgba(15,23,42,0.12)] sm:max-w-md sm:rounded-3xl"
      >
        {!running && (
          <div
            className="flex shrink-0 justify-center sm:hidden"
            onPointerDown={(event) => {
              if (event.button !== 0 || reduceMotion) return;
              dragControls.start(event);
            }}
            style={{ touchAction: "none" }}
            aria-hidden
          >
            <div className="flex min-h-11 w-full items-center justify-center pt-2">
              <div className="h-1 w-8 rounded-full bg-muted-foreground/35" />
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 pb-3 pt-3 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <SparklesIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">
                {running
                  ? "Preparing this week"
                  : done
                  ? "Ready to review"
                  : "Prepare this week"}
              </p>
              <p className="truncate text-base font-semibold text-foreground" dir="auto">
                Week {week.week}: {week.topic}
              </p>
            </div>
          </div>
          {!running && (
            <button
              type="button"
              onClick={dismissSheet}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 custom-scrollbar">
          {blocked && (
            <div className="space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                  {blocked.status ?? "Draft"} plan
                </span>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                  One quick step first
                </p>
              </div>
              <p className="text-xs leading-relaxed text-foreground/80">
                {blocked.message}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {blocked.fixableByPublishing && canPublish && (
                  <button
                    type="button"
                    onClick={publishAndRun}
                    disabled={publishing}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {publishing ? (
                      <>
                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                        Publishing…
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        Publish &amp; prepare week
                      </>
                    )}
                  </button>
                )}
                <a
                  href={`/dashboard/lesson-plans/${planId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-2.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  {blocked.fixableByPublishing && canPublish
                    ? "Review plan first"
                    : "Open plan"}
                </a>
              </div>
              {blocked.fixableByPublishing && !canPublish && (
                <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                  Your account cannot publish plans — ask an admin or the plan
                  owner to publish it.
                </p>
              )}
              {blocked.fixableByPublishing && canPublish && (
                <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                  Publishing locks this week&apos;s syllabus as the source for
                  everything prepared from it.
                </p>
              )}
            </div>
          )}

          {!running && !done && !error && !blocked && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Builds a full week for your class: a{" "}
              <strong className="font-bold text-foreground">lesson</strong>,{" "}
              <strong className="font-bold text-foreground">slides</strong>,{" "}
              <strong className="font-bold text-foreground">practice cards</strong>
              ,{" "}
              <strong className="font-bold text-foreground">homework</strong>, and a{" "}
              <strong className="font-bold text-foreground">project</strong>.
              Anything you already have is kept as-is. Students only see it after
              you release it.
            </p>
          )}

          {(running || done || log.length > 0) && !blocked && (
            <LiveEventFeed
              events={log}
              liveMessage={
                done
                  ? "This week’s package is ready for you to review."
                  : liveMessage
              }
              progress={done ? 100 : stepProgress}
            />
          )}

          <div className={`space-y-3 ${blocked ? "hidden" : ""}`}>
            <StepRow
              icon={BookOpenIcon}
              label="Lesson"
              sub="The teaching guide for this week"
              state={status.lesson}
              color="bg-primary"
            />
            <StepRow
              icon={PresentationChartLineIcon}
              label="Slides"
              sub="Class-ready slides from the lesson"
              state={status.slides}
              color="bg-cyan-600"
            />
            <StepRow
              icon={BoltIcon}
              label="Practice cards"
              sub="Quick recall flashcards for students"
              state={status.flashcard}
              color="bg-amber-500"
            />
            <StepRow
              icon={ClipboardDocumentListIcon}
              label="Homework"
              sub="A short assignment for after class"
              state={status.assignment}
              color="bg-emerald-600"
            />
            <StepRow
              icon={RocketLaunchIcon}
              label="Project"
              sub="A hands-on project with a clear brief"
              state={status.project}
              color="bg-purple-600"
            />
          </div>

          {done && hasResult && (
            <div className="space-y-2 border-t border-border pt-2">
              {result.skipped.length > 0 && (
                <p className="text-[10px] italic text-muted-foreground">
                  Already had these, so they were left alone:{" "}
                  {result.skipped.join(", ")}
                </p>
              )}
              {result.lessonId && (
                <a
                  href={`/dashboard/lessons/${result.lessonId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-primary transition-all hover:border-primary/40 hover:bg-primary/20"
                >
                  <span className="flex items-center gap-2">
                    <BookOpenIcon className="h-4 w-4" /> Open Lesson
                  </span>
                  <span>→</span>
                </a>
              )}
              {result.slideDeckId && result.lessonId && (
                <a
                  href={`/dashboard/lessons/${result.lessonId}?tab=materials#learning-slides`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-cyan-700 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/20 dark:text-cyan-300"
                >
                  <span className="flex items-center gap-2">
                    <PresentationChartLineIcon className="h-4 w-4" /> Open Slides
                  </span>
                  <span>→</span>
                </a>
              )}
              {result.deckId && (
                <a
                  href={`/dashboard/flashcards?deckId=${result.deckId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-amber-600 transition-all hover:border-amber-500/40 hover:bg-amber-500/20 dark:text-amber-400"
                >
                  <span className="flex items-center gap-2">
                    <BoltIcon className="h-4 w-4" /> Open Practice Cards
                  </span>
                  <span>→</span>
                </a>
              )}
              {result.assignmentId && (
                <a
                  href={`/dashboard/assignments/${result.assignmentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-emerald-600 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/20 dark:text-emerald-400"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardDocumentListIcon className="h-4 w-4" /> Open Homework
                  </span>
                  <span>→</span>
                </a>
              )}
              {result.projectId && (
                <a
                  href={`/dashboard/projects/${result.projectId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-purple-500/20 bg-purple-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-purple-600 transition-all hover:border-purple-500/40 hover:bg-purple-500/20 dark:text-purple-400"
                >
                  <span className="flex items-center gap-2">
                    <RocketLaunchIcon className="h-4 w-4" /> Open Project
                  </span>
                  <span>→</span>
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3.5">
              <p className="text-xs font-semibold leading-5 text-rose-600 dark:text-rose-400">
                {error}
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-border px-5 py-4 sm:px-6">
          {!running && !done && !blocked && (
            <button
              type="button"
              onClick={run}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground transition-opacity active:scale-[0.98] disabled:opacity-50"
            >
              <SparklesIcon className="h-5 w-5" /> Prepare this week
            </button>
          )}
          {blocked && (
            <button
              type="button"
              onClick={dismissSheet}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Close
            </button>
          )}
          {running && (
            <div className="flex min-h-12 flex-1 cursor-not-allowed select-none items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-[15px] font-semibold text-muted-foreground">
              <ArrowPathIcon className="h-5 w-5 animate-spin" /> Working on it…
            </div>
          )}
          {(done || error) && (
            <>
              {error && (
                <button
                  type="button"
                  onClick={run}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <ArrowPathIcon className="h-5 w-5" /> Try again
                </button>
              )}
              <button
                type="button"
                onClick={dismissSheet}
                className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground transition-opacity active:scale-[0.98]"
              >
                {done ? "Done" : "Close"}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
