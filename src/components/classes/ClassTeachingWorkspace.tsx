"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowPathIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@/lib/icons";
import type { StageStatus } from "@/lib/academic/status";

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
    [curriculumId, setCurriculumId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [adding, setAdding] = useState(false),
    [lessonTitle, setLessonTitle] = useState(""),
    [lessonWeek, setLessonWeek] = useState(1);
  // Why this class can or cannot start a plan, named precisely rather than
  // left as the database's refusal message.
  const [planStage, setPlanStage] = useState<StageStatus | null>(null);
  const load = useCallback(
    async (cid?: string) => {
      setBusy(true);
      setError("");
      try {
        const q = cid ? `?course_id=${encodeURIComponent(cid)}` : "";
        const r = await fetch(`/api/classes/${classId}/teaching-workspace${q}`);
        const j = await r.json();
        if (!r.ok)
          throw new Error(j.error || "Unable to load teaching workspace");
        setData(j.data);
        const selected = j.data.selected_course_id || "";
        setCourseId(selected);
        setCurriculumId(
          j.data.plan?.curriculum_version_id || j.data.curricula?.[0]?.id || ""
        );
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
    try {
      const r = await fetch(`/api/classes/${classId}/teaching-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Action failed");
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
      window.location.href = `/dashboard/flashcards?deckId=${
        j.data.id
      }&topic=${encodeURIComponent(
        item.title || item.topic || title
      )}&autoGenerate=true&return_class_id=${classId}`;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  const plan = data?.plan,
    progress = data?.progress;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex-1 text-xs font-bold text-muted-foreground">
            Course
            <select
              value={courseId}
              onChange={(e) => void chooseCourse(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground"
            >
              <option value="">Select a course</option>
              {(data?.courses || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs font-bold text-muted-foreground">
            Curriculum source
            <select
              value={curriculumId}
              onChange={(e) => setCurriculumId(e.target.value)}
              disabled={!courseId}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground"
            >
              <option value="">No curriculum selected</option>
              {(data?.curricula || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  Version {c.version}
                  {c.school_id ? " · School" : " · Platform"}
                </option>
              ))}
            </select>
          </label>
          {canEdit && courseId && planStage?.state !== "blocked" && (
            <button
              disabled={busy}
              onClick={() =>
                void act({ action: "ensure_plan", course_id: courseId })
              }
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50"
            >
              {plan ? "Sync plan" : "Start term plan"}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          One class + course + academic term owns one plan. Lessons and
          delivered weeks update this same record.
        </p>
      </div>
      {error && (
        <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <ExclamationTriangleIcon className="h-4 w-4" />
          {error}
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
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
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
          <p className="mt-2 text-sm font-bold">No term plan yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start the plan here — it inherits the official edition assigned to
            this class. Do not create a separate progression record.
          </p>
        </div>
      )}
      {plan && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Planned lessons"
              value={progress?.lesson_count || data.lessons.length}
            />
            <Stat label="Delivered" value={progress?.delivered_count || 0} />
            <Stat
              label="Latest week"
              value={progress?.latest_delivered_week || "—"}
            />
          </div>
          {/* The full plan editor — week-by-week AI generation, progression
             guidance and syllabus quality checks all live on the plan, which
             belongs to this class. Without this link they were unreachable
             from here. */}
          <Link
            href={`/dashboard/lesson-plans/${plan.id}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-4 transition-colors hover:border-primary/50"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-foreground">
                Open the full teaching plan
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Week-by-week editing, AI lesson generation, progression guidance
                and syllabus quality checks for this class.
              </span>
            </span>
            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">
              Open &rarr;
            </span>
          </Link>

          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">Plan · Teach · Track</h3>
                <p className="text-xs text-muted-foreground">
                  Delivery is the progression record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                className="rounded-lg border border-border px-3 py-2 text-xs font-bold"
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
            <div className="mt-4 space-y-2">
              {(data.lessons.length ? data.lessons : weeks).map(
                (item: any, i: number) => {
                  const lesson = !!item.id && !!item.title;
                  const week = Number(
                    item.curriculum_week_number || item.week || i + 1
                  );
                  const key = `${week}:${lesson ? item.id : ""}`;
                  const delivery: any = delivered.get(key);
                  const done = delivery?.status === "delivered";
                  return (
                    <div
                      key={key + i}
                      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                          Week {week}
                        </p>
                        <p className="text-sm font-bold">
                          {item.title || item.topic || `Planned week ${week}`}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/dashboard/assignments/new?class_id=${classId}&course_id=${courseId}&lesson_plan_id=${
                              plan.id
                            }&lesson_id=${
                              lesson ? item.id : ""
                            }&week=${week}&type=homework`}
                            className="rounded-lg border border-border px-2.5 py-2 text-[10px] font-black"
                          >
                            Assignment
                          </Link>
                          <Link
                            href={`/dashboard/assignments/new?class_id=${classId}&course_id=${courseId}&lesson_plan_id=${
                              plan.id
                            }&lesson_id=${
                              lesson ? item.id : ""
                            }&week=${week}&type=project`}
                            className="rounded-lg border border-border px-2.5 py-2 text-[10px] font-black"
                          >
                            Project
                          </Link>
                          <Link
                            href={`/dashboard/cbt/new?class_id=${classId}&program_id=${
                              data?.class?.program_id || ""
                            }&course_id=${courseId}&school_id=${
                              data?.class?.school_id || ""
                            }&lesson_plan_id=${plan.id}&lesson_id=${
                              lesson ? item.id : ""
                            }&curriculum_id=${
                              plan.curriculum_version_id || ""
                            }&week=${week}&topic=${encodeURIComponent(
                              item.title || item.topic || `Week ${week}`
                            )}&exam_type=evaluation`}
                            className="rounded-lg border border-border px-2.5 py-2 text-[10px] font-black"
                          >
                            Evaluation
                          </Link>
                          <button
                            disabled={busy}
                            onClick={() => void createFlashcardDeck(item, week)}
                            className="rounded-lg border border-border px-2.5 py-2 text-[10px] font-black"
                          >
                            Flashcards
                          </button>
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
                            className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-black ${
                              done
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "border border-border"
                            }`}
                          >
                            <CheckCircleIcon className="h-4 w-4" />
                            {done ? "Delivered" : "Mark delivered"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
              {!data.lessons.length && !weeks.length && (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  The plan is linked. Add its first lesson to begin delivery.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
