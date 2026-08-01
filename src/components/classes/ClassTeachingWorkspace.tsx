"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowPathIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from "@/lib/icons";
import type { StageStatus } from "@/lib/academic/status";
import {
  buildAssignmentNewHref,
  buildClassAssessmentHref,
  buildCbtNewHref,
  buildCurriculumHref,
  buildFlashcardsHref,
  buildGradesHref,
  buildLessonPlanHref,
  buildLessonSlidesHref,
  buildProjectNewHref,
  buildResultsHref,
} from "@/lib/curriculum/href";
import { SmartCourseSelect } from "@/components/courses/SmartCourseSelect";
import PipelineStepper from "@/components/pipeline/PipelineStepper";
import WeekAIGenerator from "@/components/ai/WeekAIGenerator";

type Props = {
  classId: string;
  initialCourseId?: string | null;
  canEdit: boolean;
  onCourseChange?: (id: string | null) => Promise<void> | void;
};
export function ClassTeachingWorkspace({
  classId,
  initialCourseId,
  canEdit,
  onCourseChange,
}: Props) {
  const [data, setData] = useState<any>(null),
    [courseId, setCourseId] = useState(initialCourseId || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<{
    href: string;
    label: string;
  } | null>(null);
  const [adding, setAdding] = useState(false),
    [lessonTitle, setLessonTitle] = useState(""),
    [lessonWeek, setLessonWeek] = useState(1);
  // Why this class can or cannot start a plan, named precisely rather than
  // left as the database's refusal message.
  const [planStage, setPlanStage] = useState<StageStatus | null>(null);
  // Weeks picked for a batch delivery update — catching up after a break took
  // one request per week before.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiWeek, setAiWeek] = useState<{
    week: number;
    topic: string;
    objectives?: string;
    activities?: string;
  } | null>(null);
  const load = useCallback(
    async (cid?: string) => {
      setBusy(true);
      setError("");
      setErrorAction(null);
      try {
        const q = cid ? `?course_id=${encodeURIComponent(cid)}` : "";
        const r = await fetch(`/api/classes/${classId}/teaching-workspace${q}`);
        const j = await r.json();
        if (!r.ok)
          throw new Error(j.error || "Unable to load teaching workspace");
        setData(j.data);
        setCourseId(j.data.selected_course_id || "");
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    [classId]
  );
  useEffect(() => {
    void load(initialCourseId || undefined);
  }, [load, initialCourseId]);
  useEffect(() => {
    if (!courseId) {
      setPlanStage(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/academic/status?class_id=${classId}&course_id=${courseId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setPlanStage(
          (j.stages ?? []).find((s: StageStatus) => s.id === "plan") ?? null
        );
      })
      .catch(() => {
        if (!cancelled) setPlanStage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, courseId, data]);
  const weeks = useMemo(
    () =>
      Array.isArray(data?.plan?.plan_data?.weeks)
        ? data.plan.plan_data.weeks
        : [],
    [data]
  );
  const delivered = new Map(
    (data?.deliveries || []).map((d: any) => [
      `${d.week_number}:${d.lesson_id || ""}`,
      d,
    ])
  );
  async function chooseCourse(id: string) {
    setCourseId(id);
    await onCourseChange?.(id || null);
    await load(id || undefined);
  }
  async function act(body: any) {
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
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function createLesson() {
    if (!lessonTitle.trim() || !plan) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lessonTitle.trim(),
          course_id: courseId,
          school_id: data?.class?.school_id,
          lesson_plan_id: plan.id,
          class_id: classId,
          curriculum_week_number: Number(lessonWeek) || 1,
          status: "draft",
          lesson_type: "lesson",
          metadata: { week: String(Number(lessonWeek) || 1) },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to create lesson");
      setLessonTitle("");
      setAdding(false);
      await load(courseId);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
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
    try {
      const r = await fetch(`/api/lesson-plans/${plan.id}/generate-lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || j.detail || "AI could not generate lessons");
      await load(courseId);
    } catch (e: any) {
      setError(e.message || "AI generate failed");
    } finally {
      setAiBusy(false);
    }
  }
  const plan = data?.plan,
    progress = data?.progress;
  const curriculumWeeks = weeks.length
    ? weeks
    : (data?.lessons || []).map((lesson: any, i: number) => ({
        week: Number(lesson.curriculum_week_number) || i + 1,
        topic: lesson.title,
      }));
  // Resolved by the server from the class's pathway — never chosen here.
  const officialDirection = data?.academic_direction?.available
    ? data.academic_direction.title
    : null;
  const projectsByWeek = new Map<number, any>(
    (data?.projects || []).map((project: any) => [
      Number(project.curriculum_week_number || project.metadata?.week || project.metadata?.week_number),
      project,
    ])
  );
  const slideLessonIds = new Set(
    (data?.slide_decks || []).map((deck: any) => deck.lesson_id).filter(Boolean)
  );
  const flashcardsByWeek = new Map<number, any>(
    (data?.flashcard_decks || []).map((deck: any) => [
      Number(deck.curriculum_week_number),
      deck,
    ])
  );
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

      <div className="rounded-2xl border border-border bg-background p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {/* The same evidence-backed picker used at class creation, so the course a class
              teaches is proposed identically wherever it is asked for. */}
          <div className="flex-1">
            <SmartCourseSelect
              label="Course"
              labelClass="text-xs font-bold text-muted-foreground"
              classId={classId}
              value={courseId}
              disabled={busy}
              onChange={(id) => void chooseCourse(id)}
            />
          </div>
          {/* The curriculum source is decided by the Academic Office and
             resolved automatically when the plan is created. This used to be a
             dropdown, which implied a teacher could pick a draft — the choice
             was silently discarded, so it only ever misled. */}
          <div className="flex-1 text-xs font-bold text-muted-foreground">
            Official curriculum
            <div className="mt-1 rounded-xl border border-border bg-card px-3 py-2.5">
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
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50"
              title={
                plan
                  ? "Re-resolves the official edition for this class. Weeks, lessons and delivery records are not rewritten."
                  : undefined
              }
            >
              {/* Not a full resynchronisation: the call ensures the plan exists
                 and realigns its curriculum pointer. Calling it "Sync plan"
                 implied weeks, schedule and delivery were reconciled too. */}
              {plan ? "Refresh academic direction" : "Start teaching plan"}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Curriculum weeks, AI generate, and mark-as-taught all live in this Teaching tab.
        </p>
      </div>
      {data && !data.courses?.length && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">This class needs a course before teaching can begin</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The class pathway is present, but it has no programme course to turn into a teaching plan.
            </p>
          </div>
          {canEdit && (
            <Link href={`/dashboard/classes/${classId}/edit`} className="shrink-0 rounded-xl bg-foreground px-4 py-2.5 text-xs font-black text-background">
              Complete class setup
            </Link>
          )}
        </div>
      )}
      {error && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
          <div className="flex gap-2">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          {errorAction && (
            <Link
              href={errorAction.href}
              className="ml-6 inline-flex w-fit rounded-lg border border-red-500/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-800 dark:text-red-200 hover:bg-red-500/10"
            >
              {errorAction.label}
            </Link>
          )}
        </div>
      )}
      {busy && !data && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
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
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <BookOpenIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-bold">No teaching plan yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start the plan here — it inherits the official edition assigned to
            this class. Do not create a separate progression record.
          </p>
        </div>
      )}
      {plan && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Planned lessons"
              value={progress?.lesson_count || data.lessons.length}
            />
            <Stat label="Projects" value={data.projects?.length || 0} />
            <Stat label="Slides ready" value={data.slide_decks?.length || 0} />
            <Stat label="Flashcard decks" value={data.flashcard_decks?.length || 0} />
            <Stat label="Delivered" value={progress?.delivered_count || 0} />
            <Stat
              label="Latest week"
              value={progress?.latest_delivered_week || "—"}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href={buildLessonPlanHref(plan.id)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-4 transition-colors hover:border-primary/50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-black text-foreground">
                  Open full teaching plan
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Edit weeks, syllabus quality, and deep AI tools.
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">
                Open →
              </span>
            </Link>
            {canEdit && (
              <button
                type="button"
                disabled={busy || aiBusy || curriculumWeeks.length === 0}
                onClick={() => void generateLessonsWithAi()}
                className="flex items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 text-left transition-colors hover:border-violet-500/50 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-black text-foreground">
                    <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    {aiBusy ? "Generating lessons…" : "AI generate lessons"}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Builds lessons from each curriculum week for this class.
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

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildCurriculumHref({
                courseId,
                programId: data?.class?.program_id,
              })}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40"
            >
              View curriculum
            </Link>
            <Link
              href={buildClassAssessmentHref({ classId, courseId })}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40"
            >
              Assessment desk
            </Link>
            <Link
              href={buildGradesHref({ classId, courseId })}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40"
            >
              Grades
            </Link>
            <Link
              href={buildResultsHref({ classId, courseId })}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground hover:border-primary/40"
            >
              Results
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-background p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-black">Curriculum weeks · delivery</h3>
                <p className="text-xs text-muted-foreground">
                  Mark taught, open materials, or generate a week with AI.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="w-fit rounded-lg border border-border px-3 py-2 text-xs font-bold"
              >
                {adding ? "Cancel" : "Add lesson"}
              </button>
            </div>
            {adding && (
              <div className="mt-4 grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:grid-cols-[110px_1fr_auto]">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Week
                  <input
                    type="number"
                    min={1}
                    max={53}
                    value={lessonWeek}
                    onChange={(e) => setLessonWeek(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Lesson title
                  <input
                    autoFocus
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createLesson();
                    }}
                    placeholder="What will this class learn?"
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <button
                  disabled={busy || !lessonTitle.trim()}
                  onClick={() => void createLesson()}
                  className="self-end rounded-lg bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            )}{" "}
            {canEdit && picked.size > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="flex-1 text-xs font-bold text-foreground">
                  {picked.size} week{picked.size === 1 ? "" : "s"} selected
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act({
                      action: "record_delivery_bulk",
                      lesson_plan_id: plan.id,
                      week_numbers: [...picked],
                      status: "delivered",
                    }).then(() => setPicked(new Set()))
                  }
                  className="rounded-lg bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-foreground disabled:opacity-50"
                >
                  Mark delivered
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act({
                      action: "record_delivery_bulk",
                      lesson_plan_id: plan.id,
                      week_numbers: [...picked],
                      status: "planned",
                    }).then(() => setPicked(new Set()))
                  }
                  className="rounded-lg border border-border px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  Mark not taught
                </button>
                <button
                  onClick={() => setPicked(new Set())}
                  className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="mt-4 space-y-3">
              {(data.lessons.length ? data.lessons : weeks).map(
                (item: any, i: number) => {
                  const lesson = !!item.id && !!item.title;
                  const week = Number(
                    item.curriculum_week_number || item.week || i + 1
                  );
                  const key = `${week}:${lesson ? item.id : ""}`;
                  const delivery: any = delivered.get(key);
                  const done = delivery?.status === "delivered";
                  const project = projectsByWeek.get(week);
                  const hasSlides = lesson && slideLessonIds.has(item.id);
                  const flashcardDeck = flashcardsByWeek.get(week);
                  const topic = item.title || item.topic || `Week ${week}`;
                  const weekMeta = weeks.find(
                    (w: any) => Number(w.week) === week
                  ) || { week, topic };
                  return (
                    <div
                      key={key + i}
                      className="rounded-xl border border-border bg-card p-3"
                    >
                      <div className="flex items-start gap-2">
                        {canEdit && (
                          <label className="flex shrink-0 items-center pt-1">
                            <input
                              type="checkbox"
                              aria-label={`Select week ${week}`}
                              checked={picked.has(week)}
                              onChange={(e) =>
                                setPicked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(week);
                                  else next.delete(week);
                                  return next;
                                })
                              }
                              className="h-4 w-4 accent-primary"
                            />
                          </label>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                            Week {week}
                            {done && (
                              <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                Taught
                              </span>
                            )}
                          </p>
                          <p className="text-sm font-bold text-foreground">{topic}</p>
                        </div>
                      </div>

                      {canEdit && (
                        <div className="mt-3 space-y-2">
                          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setAiWeek({
                                  week,
                                  topic,
                                  objectives: weekMeta.objectives,
                                  activities: weekMeta.activities,
                                })
                              }
                              className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-2 text-[10px] font-black text-violet-700 dark:text-violet-300"
                            >
                              <SparklesIcon className="h-3.5 w-3.5" />
                              AI generate
                            </button>
                            {lesson && (
                              <Link
                                href={buildLessonSlidesHref({
                                  lessonId: item.id,
                                  returnClassId: classId,
                                })}
                                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2.5 py-2 text-[10px] font-black"
                              >
                                {hasSlides ? "Open slides" : "Add slides"}
                              </Link>
                            )}
                            {flashcardDeck ? (
                              <Link
                                href={buildFlashcardsHref({
                                  deckId: flashcardDeck.id,
                                  classId,
                                  courseId,
                                  lessonId: lesson ? item.id : null,
                                  lessonPlanId: plan.id,
                                  topic,
                                })}
                                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2.5 py-2 text-[10px] font-black"
                              >
                                Flashcards
                              </Link>
                            ) : (
                              <button
                                disabled={busy}
                                onClick={() => void createFlashcardDeck(item, week)}
                                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2.5 py-2 text-[10px] font-black"
                              >
                                Flashcards
                              </button>
                            )}
                            <Link
                              href={buildAssignmentNewHref({
                                classId,
                                courseId,
                                lessonPlanId: plan.id,
                                lessonId: lesson ? item.id : null,
                                week,
                              })}
                              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2.5 py-2 text-[10px] font-black"
                            >
                              Assignment
                            </Link>
                            <Link
                              href={project
                                ? `/dashboard/projects/${project.id}`
                                : buildProjectNewHref({
                                    classId,
                                    courseId,
                                    schoolId: data?.class?.school_id,
                                    lessonPlanId: plan.id,
                                    lessonId: lesson ? item.id : null,
                                    week,
                                  })}
                              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2.5 py-2 text-[10px] font-black"
                            >
                              {project ? "Open project" : "Create project"}
                            </Link>
                            <Link
                              href={buildCbtNewHref({
                                classId,
                                courseId,
                                programId: data?.class?.program_id,
                                schoolId: data?.class?.school_id,
                                lessonPlanId: plan.id,
                                lessonId: lesson ? item.id : null,
                                curriculumId: plan.curriculum_version_id,
                                week,
                                topic,
                              })}
                              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2.5 py-2 text-[10px] font-black"
                            >
                              Evaluation
                            </Link>
                          </div>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act({
                                action: "record_delivery",
                                lesson_plan_id: plan.id,
                                week_number: week,
                                lesson_id: lesson ? item.id : null,
                                status: done ? "planned" : "delivered",
                              })
                            }
                            className={`inline-flex w-full min-h-10 items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-black sm:w-auto ${
                              done
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "border border-border bg-background"
                            }`}
                          >
                            <CheckCircleIcon className="h-4 w-4" />
                            {done ? "Taught — tap to undo" : "Mark as taught"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
              {!data.lessons.length && !weeks.length && (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  The plan is linked. Add a lesson or run AI generate lessons to begin delivery.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {aiWeek && plan && (
        <WeekAIGenerator
          week={aiWeek}
          planId={plan.id}
          courseId={courseId}
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
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 sm:rounded-2xl sm:p-4">
      <p className="text-xl font-black sm:text-2xl">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
