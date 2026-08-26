"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { learnerReportHref } from "@/components/reports/LearnerReportFlowStrip";
import { buildCurriculumHref, buildCertifyHref } from "@/lib/curriculum/href";
import { useAuth } from "@/contexts/auth-context";
import { humanAcademicStatus } from "@/lib/academic-spine/quality";
import { NextActionCard, StageList } from "@/components/academic/StageList";
import AcademicExceptionsWorkspace from "@/components/academic/AcademicExceptionsWorkspace";
import { nextAction, type StageStatus } from "@/lib/academic/status";
import {
  overviewAssetStages,
  overviewDeliveryStages,
} from "@/lib/academic/overview-flow";
import {
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@/lib/icons";
import MobilePageHero from "@/components/mobile/MobilePageHero";
import { AcademicPipelinePanel } from "@/components/academic/AcademicPipelinePanel";
import {
  MOBILE_PAGE_BOTTOM,
  MOBILE_TOUCH_BTN,
} from "@/components/mobile/mobile-styles";

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
  student_id?: string | null;
  class_id?: string | null;
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
  ready_to_certify: CourseRef[];
  awaiting_curriculum_count: number;
  awaiting_curriculum_sample: CourseRef[];
  stuck_plans: number;
};

type OfficeTool = {
  title: string;
  description: string;
  href: string;
  group: "teaching" | "evidence" | "governance" | "help";
  adminOnly?: boolean;
};

const SUPPORTING_TOOLS: OfficeTool[] = [
  {
    title: "Resource library",
    description: "Reusable material for class teaching. Create weekly content from the class plan.",
    href: "/dashboard/library",
    group: "teaching",
  },
  {
    title: "Attendance",
    description: "Who came to class.",
    href: "/dashboard/attendance",
    group: "evidence",
  },
  {
    title: "Teaching templates",
    description: "Reusable teaching patterns.",
    href: "/dashboard/learner-progress?view=templates",
    group: "teaching",
  },
  {
    title: "Assignment review",
    description: "Review and return submissions across classes.",
    href: "/dashboard/assignments",
    group: "evidence",
  },
  {
    title: "Project review",
    description: "Review project submissions across classes.",
    href: "/dashboard/projects",
    group: "evidence",
  },
  {
    title: "Grading inbox",
    description: "Mark work and review scores across classes.",
    href: "/dashboard/grades",
    group: "evidence",
  },
  {
    title: "Learner progress",
    description: "Coverage and outcomes.",
    href: "/dashboard/learner-progress",
    group: "evidence",
  },
  {
    title: "Certificates",
    description: "Issue when a learner is eligible.",
    href: "/dashboard/certificates/management",
    group: "evidence",
  },
  {
    title: "Learning pathways",
    description: "School, online and special programme directions.",
    href: "/dashboard/academic/pathways",
    group: "governance",
    adminOnly: true,
  },
  {
    title: "Result weighting",
    description: "How scores combine into a result.",
    href: "/dashboard/academic/weights",
    group: "governance",
    adminOnly: true,
  },
  {
    title: "How this works",
    description: "A short guide from curriculum to results.",
    href: "/dashboard/academic/guide",
    group: "help",
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
  const [showTools, setShowTools] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);

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

  useEffect(() => {
    const revealLinkedSection = () => {
      if (window.location.hash === "#academic-exceptions") setShowTools(true);
    };
    revealLinkedSection();
    window.addEventListener("hashchange", revealLinkedSection);
    return () => window.removeEventListener("hashchange", revealLinkedSection);
  }, []);

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
        throw new Error(body.error || "Could not check this report");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not check this report"
      );
    } finally {
      setChecking(null);
    }
  }

  const totals = data?.totals ?? {};

  const overviewFacts = overview
    ? {
        centralCourses: overview.central_courses,
        certifiedCourses: overview.certified_courses,
        readyToCertifyCount: overview.ready_to_certify.length,
        readyToCertifyCourseId: overview.ready_to_certify[0]?.courseId ?? null,
        awaitingCurriculumCount: overview.awaiting_curriculum_count,
        awaitingCurriculumCourseId:
          overview.awaiting_curriculum_sample[0]?.courseId ?? null,
        assignedDirections: totals.assigned_directions ?? 0,
        stuckPlans: overview.stuck_plans,
        classesWithPlans: totals.classes_with_teaching_plans ?? 0,
        classesTotal: totals.classes ?? 0,
        classesWithDeliveryStarted: totals.classes_with_delivery_started ?? 0,
        deliveredLessons: totals.delivered_lessons ?? 0,
        assessments: totals.assessments ?? 0,
        linkedAssessments: totals.linked_assessments ?? 0,
        evidenceRecords: totals.evidence_records ?? 0,
        linkedEvidence: totals.linked_evidence ?? 0,
        legacyEvidenceRecords: totals.legacy_evidence_records ?? 0,
        progressReports: totals.progress_reports ?? 0,
        readyReports: totals.ready_reports ?? 0,
        publishedReports: totals.published_reports ?? 0,
      }
    : null;

  const assetStages = overviewFacts
    ? overviewAssetStages(overviewFacts)
    : [];
  const deliveryStages = overviewFacts
    ? overviewDeliveryStages(overviewFacts)
    : [];

  const next: StageStatus | null = (() => {
    if (!isAdmin || !overviewFacts) return null;
    return nextAction(assetStages) ?? nextAction(deliveryStages) ?? null;
  })();

  const glance = [
    ...(isAdmin
      ? [
          {
            label: "Official courses",
            value:
              overview != null
                ? `${overview.certified_courses}/${overview.central_courses}`
                : "—",
            href: "/dashboard/academic/rollout",
          },
        ]
      : []),
    {
      label: "Class plans",
      value: `${totals.classes_with_teaching_plans ?? 0}/${totals.classes ?? 0}`,
      href: "/dashboard/classes",
    },
    {
      label: "Results ready",
      value: String(totals.ready_reports ?? 0),
      href: "/dashboard/academic/results",
    },
  ];

  return (
    <div
      className={`mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8 ${MOBILE_PAGE_BOTTOM}`}
    >
      <MobilePageHero
        badge={isAdmin ? "Academic Office" : "Teaching"}
        title={isAdmin ? "Academic Office" : "What to teach"}
        description={
          isAdmin
            ? "See the next academic action across curriculum, classes, evidence and results."
            : "Open a class to continue the current week and all its learning activities."
        }
        icon={AcademicCapIcon}
        actions={
          <Link
            href="/dashboard/academic/guide"
            className={`${MOBILE_TOUCH_BTN} border border-border bg-background text-foreground w-full sm:w-auto`}
          >
            How this works
          </Link>
        }
      >
        {(data?.classes?.length ?? 0) > 0 && (
          <label className="mt-4 block text-sm font-bold text-foreground">
            Look at one class
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="mt-1 block w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-normal text-foreground"
            >
              <option value="">All classes</option>
              {(data?.classes ?? []).map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </MobilePageHero>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {!loading && (
        <>
          {isAdmin && overview && (
            <NextActionCard
              next={next}
              fallback="You're caught up — curricula are certified and class plans are on them."
            />
          )}

          {/* One quiet glance — numbers only, no essays. */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {glance.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
              >
                <p className="text-2xl font-black tabular-nums text-foreground">
                  {item.value}
                </p>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </p>
              </Link>
            ))}
          </section>

          {/* Only the courses that still need a human — not a second progress bar. */}
          {isAdmin &&
            overview &&
            (overview.ready_to_certify.length > 0 ||
              overview.awaiting_curriculum_count > 0 ||
              overview.stuck_plans > 0) && (
              <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-base font-black text-foreground">
                  Waiting on you
                </h2>

                {overview.ready_to_certify.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">
                      Ready to certify
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {overview.ready_to_certify.slice(0, 4).map((course) => (
                        <li key={course.courseId}>
                          <Link
                            href={buildCertifyHref({
                              courseId: course.courseId,
                            })}
                            className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm hover:border-primary/40"
                          >
                            <span className="min-w-0 truncate font-bold text-foreground">
                              {course.title}
                            </span>
                            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">
                              Certify
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {overview.awaiting_curriculum_count > 0 && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">
                      Still need writing
                      {overview.awaiting_curriculum_count >
                      overview.awaiting_curriculum_sample.length
                        ? ` · ${overview.awaiting_curriculum_count}`
                        : ""}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {overview.awaiting_curriculum_sample
                        .slice(0, 4)
                        .map((course) => (
                          <li key={course.courseId}>
                            <Link
                              href={buildCurriculumHref({
                                courseId: course.courseId,
                              })}
                              className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:border-primary/40"
                            >
                              <span className="min-w-0 truncate font-bold text-foreground">
                                {course.title}
                              </span>
                              <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Write
                              </span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {overview.stuck_plans > 0 && (
                  <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-sm text-foreground">
                    {overview.stuck_plans === 1
                      ? "One class plan"
                      : `${overview.stuck_plans} class plans`}{" "}
                    still need an approved curriculum.{" "}
                    <Link
                      href="/dashboard/classes"
                      className="font-bold text-primary hover:underline"
                    >
                      Open classes
                    </Link>
                  </p>
                )}
              </section>
            )}

          <nav
            id="curriculum-lanes"
            aria-label="Academic work areas"
            className="grid grid-cols-3 gap-2"
          >
            <Link
              href={isAdmin ? "/dashboard/academic/build" : "/dashboard/classes"}
              className="rounded-xl border border-border bg-card px-3 py-3 text-center text-sm font-bold text-foreground hover:border-primary/40"
            >
              {isAdmin ? "Curricula" : "Classes"}
            </Link>
            <Link
              href="/dashboard/classes"
              className="rounded-xl border border-border bg-card px-3 py-3 text-center text-sm font-bold text-foreground hover:border-primary/40"
            >
              Teaching
            </Link>
            <Link
              href="/dashboard/academic/results"
              className="rounded-xl border border-border bg-card px-3 py-3 text-center text-sm font-bold text-foreground hover:border-primary/40"
            >
              Results
            </Link>
          </nav>

          {data && data.attention.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-foreground">
                    Reports to check
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A learner result needs a quick check before publishing.
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                  {data.attention.length}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {(showAllAttention
                  ? data.attention
                  : data.attention.slice(0, 3)
                ).map((report) => (
                  <article
                    key={report.id}
                    className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">
                        {report.student_name || "Learner"}
                        <span className="ml-2 text-xs font-medium text-muted-foreground">
                          {humanAcademicStatus(report.academic_qa_status)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {report.course_name || "Course"} · {report.report_term}{" "}
                        {report.report_period}
                      </p>
                      <p className="mt-1 text-sm text-foreground">
                        {report.academic_qa_issues?.[0]?.message ||
                          "Run the check to see what needs fixing."}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => checkReport(report.id)}
                        disabled={checking === report.id}
                        className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-50"
                      >
                        {checking === report.id ? "Checking…" : "Check again"}
                      </button>
                      <Link
                        href={learnerReportHref("write", {
                          reportId: report.id,
                          studentId: report.student_id,
                          classId: report.class_id,
                          term: report.report_term,
                          period: report.report_period,
                        })}
                        className="rounded-xl bg-foreground px-3 py-2 text-sm font-bold text-background"
                      >
                        Open
                      </Link>
                    </div>
                  </article>
                ))}
                {!showAllAttention && data.attention.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAttention(true)}
                    className="w-full py-2 text-sm font-bold text-primary"
                  >
                    Show all {data.attention.length}
                  </button>
                )}
              </div>
            </section>
          )}

          <section
            id="supporting-tools"
            className="rounded-2xl border border-border bg-card"
          >
            <button
              type="button"
              onClick={() => setShowTools((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span>
                <span className="block text-sm font-black text-foreground">
                  More academic tools
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Work queues, settings and diagnostics stay here when needed.
                </span>
              </span>
              {showTools
                ? <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showTools && (
              <div className="space-y-5 border-t border-border p-4 sm:p-5">
                {isAdmin && assetStages.length + deliveryStages.length > 0 && (
                  <section>
                    <h2 className="text-sm font-black text-foreground">Detailed progress</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use this only when tracing where work has stopped.
                    </p>
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      <StageList statuses={assetStages} lane="asset" />
                      <StageList statuses={deliveryStages} lane="delivery" />
                    </div>
                  </section>
                )}

                {(
                [
                  ["teaching", "Shared resources"],
                  ["evidence", "Across all classes"],
                  ["governance", "Academic settings"],
                  ["help", "Help"],
                ] as const
              ).map(([group, title]) => {
                const tools = SUPPORTING_TOOLS.filter(
                  (tool) =>
                    tool.group === group && (!tool.adminOnly || isAdmin)
                );
                if (tools.length === 0) return null;
                return (
                  <section
                    key={group}
                    id={group === "teaching" ? "teaching-resources" : undefined}
                    className="scroll-mt-24"
                  >
                    <h3 className="text-sm font-black text-foreground">
                      {title}
                    </h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {tools.map((tool) => (
                        <Link
                          key={tool.href}
                          href={tool.href}
                          className="rounded-xl border border-border px-3 py-3 transition-colors hover:border-primary/40"
                        >
                          <span className="block text-sm font-bold text-foreground">
                            {tool.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {tool.description}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
                })}

                {isAdmin && (
                  <section>
                    <h2 className="text-sm font-black text-foreground">Delivery check</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Diagnose a class that has no teaching content.
                    </p>
                    <div className="mt-3 rounded-xl border border-border px-2 pb-2">
                      <AcademicPipelinePanel embedded />
                    </div>
                  </section>
                )}

                {isAdmin && <AcademicExceptionsWorkspace classId={classId} />}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
