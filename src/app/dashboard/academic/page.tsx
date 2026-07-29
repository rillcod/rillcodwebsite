"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { humanAcademicStatus } from "@/lib/academic-spine/quality";
import { NextActionCard } from "@/components/academic/StageList";
import { LANES, stagesInLane } from "@/lib/academic/lanes";
import type { StageStatus } from "@/lib/academic/status";

type SpineData = {
  classes: { id: string; name: string }[];
  totals: Record<string, number>;
  attention: ReportRow[];
  recent_reports: ReportRow[];
  pathway: string[];
  message?: string;
};

type ReportRow = {
  id: string;
  student_name: string;
  course_name: string;
  report_term: string;
  report_period: string;
  academic_qa_status: string;
  academic_qa_issues: { code?: string; message?: string }[] | null;
  curriculum_coverage: number | null;
  teaching_delivery_pct: number | null;
  is_published: boolean;
};

type CourseRef = {
  courseId: string;
  title: string;
  programme: string | null;
};

type Overview = {
  central_courses: number;
  certified_courses: number;
  /** Draft written, one action from teachable. */
  ready_to_certify: CourseRef[];
  /** No curriculum written at all — cannot be taught by anyone. */
  awaiting_curriculum_count: number;
  awaiting_curriculum_sample: CourseRef[];
  stuck_plans: number;
};

type OfficeTool = {
  title: string;
  description: string;
  href: string;
  adminOnly?: boolean;
};

/**
 * Secondary launcher only. The ordered academic stages live in
 * src/lib/academic/lanes.ts — this catalog is for everything that sits
 * beside the two lanes, and must never be read as the workflow order.
 */
const SUPPORTING_TOOLS: OfficeTool[] = [
  {
    title: "Attendance",
    description: "Record participation as real academic evidence.",
    href: "/dashboard/attendance",
  },
  {
    title: "Teaching templates",
    description:
      "Reuse approved teaching patterns without copying the curriculum core.",
    href: "/dashboard/learner-progress?view=templates",
  },
  {
    title: "Gradebook and reports",
    description: "Review manual and automatic scores in one grading system.",
    href: "/dashboard/grades",
  },
  {
    title: "Learner progress",
    description: "Follow delivery evidence, outcomes and term decisions.",
    href: "/dashboard/learner-progress",
  },
  {
    title: "Certificates",
    description: "Issue certificates only when the learner is eligible.",
    href: "/dashboard/certificates/management",
  },
  {
    title: "How the Academic Office works",
    description: "Read the simple guide from curriculum to results.",
    href: "/dashboard/academic/guide",
  },
];

export default function AcademicSpinePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [data, setData] = useState<SpineData | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = classId ? `?class_id=${encodeURIComponent(classId)}` : "";
      const [spineRes, statusRes] = await Promise.all([
        fetch(`/api/academic-spine${query}`, { cache: "no-store" }),
        fetch("/api/academic/status", { cache: "no-store" }),
      ]);
      const body = await spineRes.json();
      if (!spineRes.ok)
        throw new Error(body.error || "Unable to open the academic view");
      setData(body.data);
      if (statusRes.ok) {
        const statusBody = await statusRes.json();
        setOverview(statusBody.overview ?? null);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to open the academic view"
      );
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  async function checkReport(reportId: string) {
    setChecking(reportId);
    setError("");
    try {
      const response = await fetch("/api/academic-spine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_report", report_id: reportId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "The evidence check could not finish");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The evidence check could not finish"
      );
    } finally {
      setChecking(null);
    }
  }

  const totals = data?.totals ?? {};

  // The single next move, derived from the real gap rather than hand-written.
  const next: StageStatus | null = (() => {
    if (!isAdmin || !overview) return null;
    // A written draft is one action away, so it outranks the far longer job of
    // writing a curriculum from nothing.
    const ready = overview.ready_to_certify;
    if (ready.length > 0) {
      return {
        id: "certify",
        state: "ready",
        headline: `${ready.length} course${
          ready.length === 1 ? " is" : "s are"
        } written and waiting to be certified.`,
        detail: `Start with ${ready[0].title}. Until a course is certified, no class can begin a teaching plan for it.`,
        actionLabel: "Certify a course",
        actionHref: "/dashboard/academic/certify",
      };
    }
    if (overview.awaiting_curriculum_count > 0) {
      return {
        id: "author",
        state: "ready",
        headline: `${overview.awaiting_curriculum_count} courses have no curriculum yet.`,
        detail:
          "A course cannot be certified or taught until its curriculum is written.",
        actionLabel: "Author curriculum",
        actionHref: "/dashboard/curriculum",
      };
    }
    if (overview.stuck_plans > 0) {
      return {
        id: "plan",
        state: "blocked",
        headline: `${overview.stuck_plans} class plan(s) are not on an official edition.`,
        detail:
          "Each one is waiting on a certification or assignment decision before it can be repaired.",
        actionLabel: "Review assignments",
        actionHref: "/dashboard/academic/distribute",
      };
    }
    return null;
  })();

  const certifiedPct =
    overview && overview.central_courses > 0
      ? Math.round((overview.certified_courses / overview.central_courses) * 100)
      : 0;

  const cards = [
    {
      title: "Direction assigned",
      href: isAdmin
        ? "/dashboard/academic/distribute"
        : "/dashboard/classes",
      value: `${totals.assigned_directions ?? 0} active`,
      detail:
        "Schools and programme pathways with an official curriculum direction. New teaching plans inherit it automatically.",
    },
    {
      title: "Teaching plan prepared",
      href: "/dashboard/classes",
      value: `${totals.classes_with_teaching_plans ?? 0} of ${
        totals.classes ?? 0
      } classes`,
      detail: `${totals.published_teaching_plans ?? 0} published and ${
        totals.draft_teaching_plans ?? 0
      } draft plan(s). ${
        totals.classes_waiting_for_teaching_plans ?? 0
      } class(es) still need a plan.`,
    },
    {
      title: "Teacher delivery started",
      href: "/dashboard/classes",
      value: `${totals.classes_with_delivery_started ?? 0} classes`,
      detail: `${
        totals.delivered_lessons ?? 0
      } lessons recorded as delivered. Plans stay editable until delivery is recorded.`,
    },
    {
      title: "Results ready",
      href: "/dashboard/academic/results",
      value: `${totals.ready_reports ?? 0} ready`,
      detail: `${
        totals.traceable_reports ?? 0
      } reports can be traced through curriculum, teaching and evidence.`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">Academic Office</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Your complete academic operation in one place
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              The Academic Office builds one official curriculum per course.
              Teachers then deliver it to their classes. This page shows where
              that work actually stands and what to do next.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="text-sm font-bold text-foreground">
              View by class
              <select
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-normal text-foreground"
              >
                <option value="">All classes I can see</option>
                {(data?.classes ?? []).map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href="/dashboard/academic/guide"
              className="self-end rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-foreground"
            >
              Read simple guide
            </Link>
          </div>
        </div>
      </section>

      {/* The one honest next action, before any list of options. */}
      {isAdmin && overview && (
        <NextActionCard
          next={next}
          fallback="Every course is certified and every class plan is on its official edition."
        />
      )}

      {/* How much of the curriculum asset actually exists. */}
      {isAdmin && overview && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-foreground">
                Curriculum certification
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A course can only be taught once it has a protected official
                edition.
              </p>
            </div>
            <p className="text-3xl font-black text-foreground">
              {overview.certified_courses}
              <span className="text-base font-bold text-muted-foreground">
                {" "}
                of {overview.central_courses} certified
              </span>
            </p>
          </div>

          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={certifiedPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${certifiedPct}%` }}
            />
          </div>

          {overview.ready_to_certify.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-widest text-primary">
                Written · ready to certify ({overview.ready_to_certify.length})
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {overview.ready_to_certify.map((course) => (
                  <Link
                    key={course.courseId}
                    href="/dashboard/academic/certify"
                    className="flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm transition-colors hover:border-primary/50"
                  >
                    <span className="min-w-0 truncate">
                      {course.programme && (
                        <span className="text-muted-foreground">
                          {course.programme} ·{" "}
                        </span>
                      )}
                      <span className="font-bold text-foreground">
                        {course.title}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">
                      Certify
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {overview.awaiting_curriculum_count > 0 && (
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                No curriculum written yet ({overview.awaiting_curriculum_count})
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                These cannot be certified or taught until someone writes their
                curriculum.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {overview.awaiting_curriculum_sample.map((course) => (
                  <Link
                    key={course.courseId}
                    href={`/dashboard/curriculum?course_id=${course.courseId}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="min-w-0 truncate">
                      {course.programme && (
                        <span className="text-muted-foreground">
                          {course.programme} ·{" "}
                        </span>
                      )}
                      <span className="font-bold text-foreground">
                        {course.title}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Write
                    </span>
                  </Link>
                ))}
              </div>
              {overview.awaiting_curriculum_count >
                overview.awaiting_curriculum_sample.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  and{" "}
                  {overview.awaiting_curriculum_count -
                    overview.awaiting_curriculum_sample.length}{" "}
                  more.
                </p>
              )}
            </div>
          )}

          {overview.stuck_plans > 0 && (
            <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <span className="font-bold text-amber-700 dark:text-amber-300">
                {overview.stuck_plans} class plan(s)
              </span>{" "}
              are not attached to an official edition. Open a class to see the
              exact reason and the fix for that class.
            </p>
          )}
        </section>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {loading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          Following the academic trail…
        </div>
      )}

      {!loading && data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <p className="text-sm font-semibold text-muted-foreground">
                  {card.title}
                </p>
                <p className="mt-3 text-3xl font-black text-foreground">
                  {card.value}
                </p>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  {card.detail}
                </p>
              </Link>
            ))}
          </section>

          {/* The two lanes, straight from the kernel — never hand-written. */}
          <section className="grid gap-4 lg:grid-cols-2">
            {(["asset", "delivery"] as const).map((laneId) => {
              const lane = LANES[laneId];
              return (
                <article
                  key={laneId}
                  className="rounded-3xl border border-border bg-card p-6"
                >
                  <h2 className="text-lg font-black text-foreground">
                    {lane.label}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lane.summary}
                  </p>
                  <ol className="mt-4 space-y-2" role="list">
                    {stagesInLane(laneId).map((s) => (
                      <li key={s.id}>
                        <Link
                          href={s.href}
                          className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/50 hover:bg-primary/5"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-black text-muted-foreground">
                            {s.step}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-foreground">
                              {s.label}
                            </span>
                            <span className="block text-xs leading-5 text-muted-foreground">
                              {s.purpose}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </article>
              );
            })}
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-foreground">
                  Reports needing human attention
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing here means a teacher has failed. It means the evidence
                  trail needs one clear correction before publication.
                </p>
              </div>
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm font-bold text-amber-700 dark:text-amber-300">
                {data.attention.length} to review
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {data.attention.length === 0 && (
                <div className="rounded-2xl bg-emerald-500/10 p-5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  No traceable reports need attention in this view.
                </div>
              )}
              {data.attention.map((report) => (
                <article
                  key={report.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border p-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-foreground">
                        {report.student_name || "Learner"}
                      </p>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                        {humanAcademicStatus(report.academic_qa_status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {report.course_name || "Course"} · {report.report_term}{" "}
                      {report.report_period}
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {report.academic_qa_issues?.[0]?.message ||
                        "Run the evidence check to see what needs attention."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => checkReport(report.id)}
                      disabled={checking === report.id}
                      className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground disabled:opacity-50"
                    >
                      {checking === report.id
                        ? "Checking…"
                        : "Check evidence again"}
                    </button>
                    <Link
                      href={`/dashboard/reports/builder?report=${report.id}`}
                      className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background"
                    >
                      Open report
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="supporting-tools" className="space-y-4">
            <div>
              <h2
                id="supporting-tools"
                className="text-xl font-black text-foreground"
              >
                Supporting workspaces
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Everything that sits beside the two lanes above.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {SUPPORTING_TOOLS.filter((tool) => !tool.adminOnly || isAdmin).map(
                (tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="block text-sm font-black text-foreground">
                      {tool.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {tool.description}
                    </span>
                  </Link>
                )
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
