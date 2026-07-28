"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { humanAcademicStatus } from "@/lib/academic-spine/quality";

type SpineData = {
  classes: { id: string; name: string }[];
  totals: Record<string, number>;
  attention: ReportRow[];
  recent_reports: ReportRow[];
  pathway: string[];
  message?: string;
};

type OfficeTool = {
  title: string;
  description: string;
  href: string;
  adminOnly?: boolean;
};

const OFFICE_GROUPS: Array<{
  title: string;
  description: string;
  tools: OfficeTool[];
}> = [
  {
    title: "Direction",
    description: "Decide what should be taught and where it applies.",
    tools: [
      {
        title: "How the Academic Office works",
        description:
          "Read the simple guide from curriculum to teaching, results and certificates.",
        href: "/dashboard/academic-spine/guide",
      },
      {
        title: "Curriculum direction",
        description: "Review, protect and assign the official curriculum.",
        href: "/dashboard/curriculum/studio",
        adminOnly: true,
      },
      {
        title: "Curriculum builder",
        description: "Create and maintain the reusable curriculum source.",
        href: "/dashboard/curriculum",
        adminOnly: true,
      },
      {
        title: "Programmes and courses",
        description: "Organise regular school, virtual and special programmes.",
        href: "/dashboard/programs",
        adminOnly: true,
      },
      {
        title: "School timing",
        description:
          "Set each school or class entry term, week and programme position.",
        href: "/dashboard/curriculum/studio/timing",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Teaching and delivery",
    description: "Turn the official direction into practical classroom work.",
    tools: [
      {
        title: "Teaching plans",
        description: "Plan lessons from the assigned curriculum direction.",
        href: "/dashboard/lesson-plans",
      },
      {
        title: "Teaching templates",
        description:
          "Reuse approved teaching patterns without copying the curriculum core.",
        href: "/dashboard/learner-progress?view=templates",
      },
      {
        title: "Classes",
        description:
          "Open the teacher, learner and curriculum delivery workspace.",
        href: "/dashboard/classes",
      },
      {
        title: "Curriculum coverage",
        description:
          "See what has been taught, missed or moved without changing results.",
        href: "/dashboard/learner-progress?view=delivery",
      },
      {
        title: "Attendance",
        description: "Record participation as real academic evidence.",
        href: "/dashboard/attendance",
      },
    ],
  },
  {
    title: "Evidence and outcomes",
    description:
      "Bring marks, reports and advancement together without overwriting manual work.",
    tools: [
      {
        title: "Gradebook and reports",
        description:
          "Review manual and automatic scores in one grading system.",
        href: "/dashboard/grades",
      },
      {
        title: "Results workspace",
        description: "Check readiness and publish traceable results.",
        href: "/dashboard/academic-spine/results",
      },
      {
        title: "Learner progress",
        description:
          "Follow delivery evidence, learner outcomes and term decisions in one workspace.",
        href: "/dashboard/learner-progress",
      },
      {
        title: "Certificates",
        description: "Issue certificates only when the learner is eligible.",
        href: "/dashboard/certificates/management",
      },
    ],
  },
  {
    title: "Academic controls",
    description: "Advanced rules managed by the Academic Office.",
    tools: [
      {
        title: "Result weights",
        description:
          "Control how assignments, CBT, practical work and attendance contribute.",
        href: "/dashboard/academic-spine/weights",
        adminOnly: true,
      },
      {
        title: "Learning pathways",
        description: "Confirm enrollment-led delivery for each programme type.",
        href: "/dashboard/academic-spine/pathways",
        adminOnly: true,
      },
      {
        title: "Academic rules",
        description:
          "Manage term, promotion and delivery rules in the Learner Progress flow.",
        href: "/dashboard/learner-progress?view=rules&tab=academic-rules",
        adminOnly: true,
      },
      {
        title: "Academic change history",
        description:
          "See who changed progression records or academic rules and when.",
        href: "/dashboard/learner-progress?view=history",
        adminOnly: true,
      },
    ],
  },
];
type ReportRow = {
  id: string;
  student_name: string | null;
  section_class: string | null;
  course_name: string | null;
  report_term: string | null;
  report_period: string | null;
  academic_qa_status: string;
  academic_qa_issues: { code?: string; message?: string }[] | null;
  curriculum_coverage: number | null;
  teaching_delivery_pct: number | null;
  is_published: boolean;
};

export default function AcademicSpinePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [data, setData] = useState<SpineData | null>(null);
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = classId ? `?class_id=${encodeURIComponent(classId)}` : "";
      const response = await fetch(`/api/academic-spine${query}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to open the academic view");
      setData(body.data);
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
  const cards = [
    {
      title: "Direction assigned",
      href: isAdmin
        ? "/dashboard/curriculum/studio/schools"
        : "/dashboard/classes",
      value: `${totals.assigned_directions ?? 0} active`,
      detail:
        "Eligible schools and programme offerings have an official curriculum direction. New teaching plans inherit it automatically.",
    },
    {
      title: "Teaching plan prepared",
      href: "/dashboard/lesson-plans",
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
      } lessons are recorded as delivered. Plans stay editable until the teacher publishes or records delivery.`,
    },
    {
      title: "Results ready",
      href: "/dashboard/academic-spine/results",
      value: `${totals.ready_reports ?? 0} ready`,
      detail: `${
        totals.traceable_reports ?? 0
      } reports can be traced through curriculum, teaching and evidence. Manual results remain manual.`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">
              Academic Office
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Your complete academic operation in one place
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Curriculum direction, classroom delivery, assessment evidence,
              results and learner progression work together here. You see what
              is ready, what needs attention and the next useful action —
              without seeing the technical machinery behind it.
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
              href="/dashboard/academic-spine/guide"
              className="self-end rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-foreground"
            >
              Read simple guide
            </Link>
            {isAdmin && (
              <Link
                href="/dashboard/curriculum/studio"
                className="self-end rounded-xl bg-primary px-5 py-3 text-center text-sm font-bold text-primary-foreground"
              >
                Set curriculum direction
              </Link>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="academic-office-tools" className="space-y-4">
        <div>
          <h2
            id="academic-office-tools"
            className="text-xl font-black text-foreground"
          >
            Academic workspaces
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the work you need. The Academic Office keeps the data
            connected behind the scenes.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {OFFICE_GROUPS.map((group) => {
            const visibleTools = group.tools.filter(
              (tool) => !tool.adminOnly || isAdmin
            );
            if (visibleTools.length === 0) return null;
            return (
              <article
                key={group.title}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <h3 className="font-black text-foreground">{group.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {group.description}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {visibleTools.map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="block text-sm font-black text-foreground">
                        {tool.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {tool.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
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

          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-xl font-black text-foreground">
              How learning moves through the Academic Office
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {data.pathway.map((step, index) => (
                <div
                  key={step}
                  className="relative rounded-2xl border border-border bg-background p-4"
                >
                  <span className="text-xs font-black text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-2 text-sm font-bold text-foreground">
                    {step}
                  </p>
                </div>
              ))}
            </div>
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
        </>
      )}
    </div>
  );
}
