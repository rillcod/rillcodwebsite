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
  buildLessonNewHref,
  buildLessonPlanHref,
  buildLessonSlidesHref,
  buildProjectNewHref,
  buildResultsHref,
} from "@/lib/curriculum/href";
import {
  indexFirstByWeek,
  weekPackageStatus,
} from "@/lib/academic/week-package";
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
    notes?: string;
    assignment?: { title?: string; brief?: string };
    project?: { title?: string; description?: string };
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
  const deliveredByWeek = new Map<number, any>(
    (data?.deliveries || []).map((delivery: any) => [
      Number(delivery.week_number),
      delivery,
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
      if (!r.ok)
        throw new Error(j.error || j.detail || "AI could not generate lessons");
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
  const lessonsByWeek = indexFirstByWeek<any>(data?.lessons);
  const assignmentsByWeek = indexFirstByWeek<any>(data?.assignments);
  const projectsByWeek = indexFirstByWeek<any>(data?.projects);
  const slidesByWeek = indexFirstByWeek<any>(data?.slide_decks);
  const flashcardsByWeek = indexFirstByWeek<any>(data?.flashcard_decks);
  const selectedCourse = (data?.courses || []).find(
    (course: any) => course.id === courseId
  );
  const toolLinkClass =
    "inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-[10px] font-black text-foreground transition-colors hover:border-primary/40";

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
          Curriculum weeks, AI generate, and mark-as-taught all live in this
          Teaching tab.
        </p>
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
            <Stat
              label="Flashcard decks"
              value={data.flashcard_decks?.length || 0}
            />
            <Stat label="Delivered" value={progress?.delivered_count || 0} />
            <Stat label="Assignments" value={data.assignments?.length || 0} />
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
                    {aiBusy
                      ? "Generating lessons…"
                      : "Generate lesson foundations"}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Creates missing lessons in bulk. Complete each five-part
                    package below.
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
                <h3 className="text-sm font-black">Weekly teaching packages</h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  Prepare the lesson, learning slides, flashcards, assignment,
                  and project as one connected week.
                </p>
              </div>
              <span className="w-fit rounded-full bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                5 linked assets per week
              </span>
            </div>

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
              {curriculumWeeks.map((weekMeta: any, i: number) => {
                const week = Number(
                  weekMeta.week || weekMeta.curriculum_week_number || i + 1
                );
                const lesson = lessonsByWeek.get(week);
                const assignment = assignmentsByWeek.get(week);
                const project = projectsByWeek.get(week);
                const slideDeck =
                  slidesByWeek.get(week) ||
                  (lesson
                    ? (data?.slide_decks || []).find(
                        (deck: any) => deck.lesson_id === lesson.id
                      )
                    : null);
                const flashcardDeck =
                  flashcardsByWeek.get(week) ||
                  (lesson
                    ? (data?.flashcard_decks || []).find(
                        (deck: any) => deck.lesson_id === lesson.id
                      )
                    : null);
                const topic = weekMeta.topic || lesson?.title || `Week ${week}`;
                const objectives: string =
                  typeof weekMeta.objectives === "string"
                    ? weekMeta.objectives
                    : Array.isArray(weekMeta.objectives)
                    ? weekMeta.objectives.join("\n")
                    : "";
                const activities: string =
                  typeof weekMeta.activities === "string"
                    ? weekMeta.activities
                    : Array.isArray(weekMeta.activities)
                    ? weekMeta.activities.join("\n")
                    : "";
                const packageStatus = weekPackageStatus({
                  lesson: Boolean(lesson),
                  slides: Boolean(slideDeck),
                  flashcards: Boolean(flashcardDeck),
                  assignment: Boolean(assignment),
                  project: Boolean(project),
                });
                const delivery = deliveredByWeek.get(week);
                const taught = delivery?.status === "delivered";
                const manualLessonHref = buildLessonNewHref({
                  classId,
                  courseId,
                  programId: data?.class?.program_id,
                  lessonPlanId: plan.id,
                  curriculumId: plan.curriculum_version_id,
                  week,
                  topic,
                  subject: selectedCourse?.title,
                  description: [objectives, activities]
                    .filter(Boolean)
                    .join("\n\n"),
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

                return (
                  <article
                    key={week}
                    className="overflow-hidden rounded-2xl border border-border bg-card"
                  >
                    <div className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        {canEdit && (
                          <label className="flex shrink-0 items-center pt-1">
                            <input
                              type="checkbox"
                              aria-label={`Select week ${week}`}
                              checked={picked.has(week)}
                              onChange={(event) =>
                                setPicked((previous) => {
                                  const next = new Set(previous);
                                  if (event.target.checked) next.add(week);
                                  else next.delete(week);
                                  return next;
                                })
                              }
                              className="h-4 w-4 accent-primary"
                            />
                          </label>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                              Week {week}
                            </p>
                            {taught && (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                Taught
                              </span>
                            )}
                          </div>
                          <h4 className="mt-1 text-sm font-black leading-5 text-foreground sm:text-base">
                            {topic}
                          </h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {packageStatus.readyCount} of{" "}
                            {packageStatus.totalCount} teaching assets ready
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                            packageStatus.complete
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {packageStatus.complete
                            ? "Ready"
                            : `${packageStatus.missing.length} missing`}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <AssetStatus label="Lesson" ready={Boolean(lesson)} />
                        <AssetStatus
                          label="Slides"
                          ready={Boolean(slideDeck)}
                        />
                        <AssetStatus
                          label="Flashcards"
                          ready={Boolean(flashcardDeck)}
                        />
                        <AssetStatus
                          label="Assignment"
                          ready={Boolean(assignment)}
                        />
                        <AssetStatus label="Project" ready={Boolean(project)} />
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        {canEdit && !packageStatus.complete ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setAiWeek({
                                week,
                                topic,
                                objectives,
                                activities,
                                notes: weekMeta.notes,
                                assignment: weekMeta.assignment,
                                project: weekMeta.project,
                              })
                            }
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm disabled:opacity-50"
                          >
                            <SparklesIcon className="h-4 w-4" />
                            Prepare missing assets with AI
                          </button>
                        ) : lesson ? (
                          <Link
                            href={`/dashboard/lessons/${lesson.id}`}
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm"
                          >
                            Review lesson package
                          </Link>
                        ) : null}
                        {canEdit && !lesson && (
                          <Link
                            href={manualLessonHref}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-black text-foreground"
                          >
                            Build lesson manually
                          </Link>
                        )}
                        {canEdit && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act({
                                action: "record_delivery",
                                lesson_plan_id: plan.id,
                                week_number: week,
                                lesson_id: lesson?.id || null,
                                status: taught ? "planned" : "delivered",
                              })
                            }
                            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black ${
                              taught
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "border border-border bg-background text-foreground"
                            }`}
                          >
                            <CheckCircleIcon className="h-4 w-4" />
                            {taught ? "Taught - undo" : "Mark as taught"}
                          </button>
                        )}
                      </div>
                    </div>

                    <details className="border-t border-border bg-muted/20">
                      <summary className="cursor-pointer list-none px-3 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground sm:px-4">
                        Open individual tools
                      </summary>
                      <div className="grid grid-cols-2 gap-2 border-t border-border p-3 sm:flex sm:flex-wrap sm:p-4">
                        {lesson ? (
                          <Link
                            href={`/dashboard/lessons/${lesson.id}`}
                            className={toolLinkClass}
                          >
                            Open lesson
                          </Link>
                        ) : canEdit ? (
                          <Link
                            href={manualLessonHref}
                            className={toolLinkClass}
                          >
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
                            {slideDeck ? "Open slides" : "Add slides"}
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
                            Open flashcards
                          </Link>
                        ) : canEdit ? (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void createFlashcardDeck(lesson || weekMeta, week)
                            }
                            className={`${toolLinkClass} disabled:opacity-50`}
                          >
                            Create flashcards
                          </button>
                        ) : null}
                        {assignment ? (
                          <Link
                            href={`/dashboard/assignments/${assignment.id}`}
                            className={toolLinkClass}
                          >
                            Open assignment
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
                            Create assignment
                          </Link>
                        ) : null}
                        {project ? (
                          <Link
                            href={`/dashboard/projects/${project.id}`}
                            className={toolLinkClass}
                          >
                            Open project
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
                            Create project
                          </Link>
                        ) : null}
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
                          Evaluation
                        </Link>
                      </div>
                    </details>
                  </article>
                );
              })}
              {curriculumWeeks.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs leading-5 text-muted-foreground">
                  This plan has no curriculum weeks yet. Open the full teaching
                  plan to add its progression.
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
          classId={classId}
          existing={{
            lessonId: lessonsByWeek.get(aiWeek.week)?.id,
            slideDeckId: slidesByWeek.get(aiWeek.week)?.id,
            deckId: flashcardsByWeek.get(aiWeek.week)?.id,
            assignmentId: assignmentsByWeek.get(aiWeek.week)?.id,
            projectId: projectsByWeek.get(aiWeek.week)?.id,
          }}
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

function AssetStatus({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
        ready
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          ready ? "bg-emerald-500" : "bg-muted-foreground/40"
        }`}
      />
      {label}
    </span>
  );
}
