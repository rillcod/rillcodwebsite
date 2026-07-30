"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  PresentationChartLineIcon,
  DocumentChartBarIcon,
  BookOpenIcon,
  Cog6ToothIcon,
  BoltIcon,
  ShieldExclamationIcon,
} from "@/lib/icons";
import type {
  StudentLevelEnrollment,
  PromotionDecision,
} from "@/types/progression.types";
import {
  academicYearOptions,
  getCurrentAcademicYear,
  labelFromTermNumber,
  liveAcademicSession,
  nextAcademicSession,
  termNumberFromLabel,
} from "@/lib/reports/academic-period";

type TermOption = {
  value: string;
  label: string;
  aliases: string[];
};

type AcademicTerm = {
  id: string;
  academic_year: string;
  term_number: number;
  term_label: string;
  is_current?: boolean | null;
};

function legacyTermLabel(termNumber: number, academicYear: string): string {
  const startYear =
    academicYear.split("/")[0] || getCurrentAcademicYear().split("/")[0];
  return `Term ${termNumber} ${startYear}`;
}

function buildFallbackTermOptions(): TermOption[] {
  const years = academicYearOptions();
  const options: TermOption[] = [];
  for (const year of years) {
    for (const termNumber of [1, 2, 3] as const) {
      const termLabel = labelFromTermNumber(termNumber);
      const canonical = `${termLabel} ${year}`;
      const legacy = legacyTermLabel(termNumber, year);
      options.push({
        value: canonical,
        label: canonical,
        // Never alias bare "First Term" — years would collide.
        aliases: [canonical, legacy],
      });
    }
  }
  return options;
}

const FALLBACK_TERM_OPTIONS = buildFallbackTermOptions();
const LIVE_SESSION = liveAcademicSession();
const LIVE_FALLBACK_TERM = `${LIVE_SESSION.termLabel} ${LIVE_SESSION.periodLabel}`;

function termOptionFromAcademicTerm(term: AcademicTerm): TermOption {
  const canonical = `${term.term_label} ${term.academic_year}`;
  const legacy = legacyTermLabel(term.term_number, term.academic_year);
  return {
    value: canonical,
    label: canonical,
    // Keep year-bound aliases only so First Term across sessions stay distinct.
    aliases: [canonical, legacy].filter(Boolean),
  };
}

function termMatches(
  savedLabel: string | null | undefined,
  selectedTerm: string,
  options: TermOption[]
): boolean {
  if (!savedLabel) return false;
  const normalized = savedLabel.trim().toLowerCase();
  const selected = options.find((option) => option.value === selectedTerm);
  const aliases = selected?.aliases ?? [selectedTerm];
  return aliases.some((alias) => alias.trim().toLowerCase() === normalized);
}

function nextTerm(
  label: string,
  options: TermOption[] = FALLBACK_TERM_OPTIONS
): string {
  const idx = options.findIndex(
    (option) => option.value === label || option.aliases.includes(label)
  );
  if (idx >= 0 && idx < options.length - 1) return options[idx + 1].value;

  // Canonical "Third Term 2025/2026" → next positional session
  const slash = label.match(/^(First|Second|Third) Term\s+(\d{4}\/\d{4})$/i);
  if (slash) {
    const next = nextAcademicSession({
      termLabel: `${slash[1]} Term`,
      periodLabel: slash[2],
    });
    return `${next.termLabel} ${next.periodLabel}`;
  }

  const [, num, year] = label.match(/Term (\d) (\d{4})/) ?? [];
  if (!num || !year) return label;
  const next = nextAcademicSession({
    termLabel: labelFromTermNumber(num),
    periodLabel: `${year}/${parseInt(year, 10) + 1}`,
  });
  return legacyTermLabel(
    parseInt(termNumberFromLabel(next.termLabel), 10),
    next.periodLabel
  );
}

// ── Decision badge styles ─────────────────────────────────────────────────────
const DECISION_META: Record<
  PromotionDecision,
  { label: string; cls: string; icon: any }
> = {
  promote: {
    label: "Promote",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: ArrowRightIcon,
  },
  repeat: {
    label: "Repeat",
    cls: "bg-amber-500/10  text-amber-600 dark:text-amber-400  border-amber-500/30",
    icon: ArrowPathIcon,
  },
  complete: {
    label: "Complete",
    cls: "bg-primary/10 text-primary border-primary/30",
    icon: CheckCircleIcon,
  },
  withdraw: {
    label: "Withdraw",
    cls: "bg-rose-500/10   text-rose-600 dark:text-rose-400   border-rose-500/30",
    icon: ExclamationTriangleIcon,
  },
};

function getSmartRecommendation(
  grade: string | undefined,
  hasNextLevel: boolean
): { decision: PromotionDecision; label: string; desc: string; cls: string } {
  if (!grade) {
    return {
      decision: "promote",
      label: "Promote",
      desc: "No grade available yet. Suggest default promotion.",
      cls: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    };
  }
  const g = grade.toUpperCase().trim();
  if (g === "F" || g === "E") {
    return {
      decision: "repeat",
      label: "Repeat",
      desc: `Grade is ${g}. Academic review recommended. Suggest repeating.`,
      cls: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
    };
  }
  if (!hasNextLevel) {
    return {
      decision: "complete",
      label: "Complete Track",
      desc: `Grade is ${g}. Student is at the final level. Suggest graduation.`,
      cls: "text-primary bg-primary/10 border-primary/20",
    };
  }
  return {
    decision: "promote",
    label: "Promote",
    desc: `Grade is ${g}. Academic good standing. Suggest promoting.`,
    cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };
}

export default function ProgressionPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { profile, loading: authLoading } = useAuth();
  const isStaff =
    profile?.role === "admin" ||
    profile?.role === "teacher" ||
    profile?.role === "school";
  const canPromote = profile?.role === "admin" || profile?.role === "teacher";

  const [programs, setPrograms] = useState<any[]>([]);
  const [filterProgram, setFilterProg] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [termOptions, setTermOptions] = useState<TermOption[]>(
    FALLBACK_TERM_OPTIONS
  );
  const [filterTerm, setFilterTerm] = useState(
    FALLBACK_TERM_OPTIONS.find((o) => o.value === LIVE_FALLBACK_TERM)?.value ??
      FALLBACK_TERM_OPTIONS[0]?.value ??
      LIVE_FALLBACK_TERM
  );
  const [enrollments, setEnrollments] = useState<StudentLevelEnrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, PromotionDecision>>(
    {}
  );
  const [reports, setReports] = useState<
    Record<
      string,
      {
        overall_grade: string;
        overall_score?: number | null;
        is_published?: boolean | null;
        report_term?: string | null;
        report_period?: string | null;
      }
    >
  >({});
  const [reportsLoading, setReportsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Load programs for filter
  useEffect(() => {
    if (!profile || !isStaff) return;
    fetch("/api/programs?is_active=true")
      .then((r) => r.json())
      .then((j) => setPrograms(j.data ?? []));
  }, [profile?.id]); // eslint-disable-line

  useEffect(() => {
    if (!profile || !isStaff) return;
    const params = new URLSearchParams();
    if (profile.school_id) params.set("school_id", profile.school_id);
    fetch(`/api/settings/academic-year${params.size ? `?${params}` : ""}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        const terms = Array.isArray(j.terms) ? (j.terms as AcademicTerm[]) : [];
        if (terms.length === 0) return;
        const options = terms
          .slice()
          .sort((a, b) => {
            if (a.academic_year !== b.academic_year)
              return a.academic_year.localeCompare(b.academic_year);
            return a.term_number - b.term_number;
          })
          .map(termOptionFromAcademicTerm);
        setTermOptions(options);
        const current =
          (j.current_term as AcademicTerm | null | undefined) ??
          terms.find(
            (t) =>
              t.academic_year === LIVE_SESSION.periodLabel &&
              t.term_label === LIVE_SESSION.termLabel
          ) ??
          terms.find((t) => t.is_current) ??
          terms[0];
        setFilterTerm(termOptionFromAcademicTerm(current).value);
      })
      .catch(() => {
        setTermOptions(FALLBACK_TERM_OPTIONS);
      });
  }, [profile?.id, profile?.school_id, isStaff]);

  // Load enrollments when filters change
  useEffect(() => {
    if (!profile || !isStaff || !filterTerm) return;
    const params = new URLSearchParams({ status: "active" });
    if (filterCourse) params.set("course_id", filterCourse);
    if (filterProgram) params.set("program_id", filterProgram);
    if (profile.role === "school" && profile.school_id)
      params.set("school_id", profile.school_id);
    setLoading(true);
    fetch(`/api/student-level-enrollments?${params}`)
      .then((r) => r.json())
      .then(async (j) => {
        const rows: StudentLevelEnrollment[] = (j.data ?? []).filter(
          (e: StudentLevelEnrollment) =>
            termMatches(e.term_label, filterTerm, termOptions)
        );
        setEnrollments(rows);
        setDecisions({});
        setSubmitted([]);

        // Load progress reports to provide smart recommendations
        const studentIds = rows.map((r) => r.student_id).filter(Boolean);
        if (studentIds.length > 0) {
          setReportsLoading(true);
          const db = createClient();
          const chunkSize = 100;
          const chunks: string[][] = [];
          for (let i = 0; i < studentIds.length; i += chunkSize) {
            chunks.push(studentIds.slice(i, i + chunkSize));
          }
          const allReports: any[] = [];
          await Promise.all(
            chunks.map(async (chunk) => {
              const { data: reportRows, error } = await db
                .from("student_progress_reports")
                .select(
                  "student_id, overall_grade, overall_score, is_published, report_term, report_period, updated_at"
                )
                .in("student_id", chunk);
              if (!error && reportRows) {
                allReports.push(...reportRows);
              }
            })
          );

          const selected = termOptions.find(
            (option) => option.value === filterTerm
          );
          const selectedAliases = new Set(
            (selected?.aliases ?? [filterTerm]).map((alias) =>
              alias.trim().toLowerCase()
            )
          );
          // Require year+term; never match bare report_term across academic years.
          const reportMatchesSelectedTerm = (report: any) => {
            const reportTerm = String(report.report_term ?? "").trim();
            const reportPeriod = String(report.report_period ?? "").trim();
            if (!reportTerm || !reportPeriod) return false;
            const pair = `${reportTerm} ${reportPeriod}`.trim().toLowerCase();
            const legacyPair = `term ${termNumberFromLabel(reportTerm)} ${
              reportPeriod.split("/")[0]
            }`.toLowerCase();
            return selectedAliases.has(pair) || selectedAliases.has(legacyPair);
          };

          allReports.sort((a, b) => {
            const aTermMatch = reportMatchesSelectedTerm(a);
            const bTermMatch = reportMatchesSelectedTerm(b);
            if (aTermMatch !== bTermMatch) return aTermMatch ? -1 : 1;
            if (a.is_published !== b.is_published)
              return a.is_published ? -1 : 1;
            return (
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime()
            );
          });

          const rMap: Record<
            string,
            {
              overall_grade: string;
              overall_score?: number | null;
              is_published?: boolean | null;
              report_term?: string | null;
              report_period?: string | null;
            }
          > = {};
          allReports.forEach((r) => {
            // Only bind reports that match the selected session — never another term's grade.
            if (
              r.student_id &&
              !rMap[r.student_id] &&
              reportMatchesSelectedTerm(r)
            ) {
              rMap[r.student_id] = {
                overall_grade: r.overall_grade,
                overall_score: r.overall_score,
                is_published: r.is_published,
                report_term: r.report_term,
                report_period: r.report_period,
              };
            }
          });
          setReports(rMap);
          setReportsLoading(false);
        } else {
          setReports({});
        }
      })
      .finally(() => setLoading(false));
  }, [filterProgram, filterCourse, filterTerm, termOptions, profile?.id]); // eslint-disable-line

  const selectedProgram = programs.find((p) => p.id === filterProgram);
  const availableCourses: any[] =
    selectedProgram?.courses?.filter((c: any) => c.is_active !== false) ?? [];
  const pending = enrollments.filter((e) => !submitted.includes(e.id));

  // Aggregated counts for summary bar
  const decidedCount = pending.filter((e) => decisions[e.id]).length;
  const processedCount = submitted.length;
  const decisionCounts = (
    ["promote", "repeat", "complete", "withdraw"] as PromotionDecision[]
  )
    .map((d) => ({
      d,
      count: Object.values(decisions).filter((v) => v === d).length,
    }))
    .filter((x) => x.count > 0);

  async function submitAll() {
    const toProcess = pending.filter((e) => decisions[e.id]);
    if (toProcess.length === 0) {
      setError("Set a decision for at least one student");
      return;
    }
    setSubmitting(true);
    setError("");
    const next = nextTerm(filterTerm, termOptions);
    const failed: string[] = [];

    for (const enroll of toProcess) {
      const res = await fetch(`/api/student-level-enrollments/${enroll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: decisions[enroll.id],
          next_term_label: next,
        }),
      });
      if (res.ok) {
        setSubmitted((prev) => [...prev, enroll.id]);
      } else {
        failed.push(
          (enroll as any).portal_users?.full_name ?? enroll.student_id
        );
      }
    }
    if (failed.length) setError(`Failed for: ${failed.join(", ")}`);
    setSubmitting(false);
  }

  if (authLoading || !profile)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!isStaff)
    return (
      <div className="p-20 text-center text-muted-foreground font-bold uppercase tracking-widest">
        Access denied
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-8 pb-32">
      {/* Page Header */}
      <div className={embedded ? "hidden" : "space-y-1"}>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          Promotion & Completion
        </h1>
        <p className="text-sm text-muted-foreground">
          Review student progress, decide who advances to the next level, and
          track outcomes across all your classes.
        </p>
      </div>

      {canPromote && !embedded && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/learner-progress?view=delivery"
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-bold hover:bg-muted/50 transition-colors"
          >
            <PresentationChartLineIcon className="w-3.5 h-3.5" /> Delivery
            Progress
          </Link>
          <Link
            href="/dashboard/reports/builder"
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-bold hover:bg-muted/50 transition-colors"
          >
            <DocumentChartBarIcon className="w-3.5 h-3.5" /> Report Cards
          </Link>
        </div>
      )}

      {/* Promotion Cycle Manager */}
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 px-1">
            <UserGroupIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-widest text-foreground">
                Learner Decisions
              </h2>
              <p className="text-xs text-muted-foreground italic mt-0.5">
                Choose what happens to each student at the end of term —
                advance, repeat, or graduate.
              </p>
            </div>
          </div>

          {/* Quick Action Filters — always 1-col on mobile, 3-col on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-card/50 backdrop-blur-xl border border-border p-3 rounded-2xl shadow-lg">
            <select
              title="Program"
              value={filterProgram}
              onChange={(e) => {
                setFilterProg(e.target.value);
                setFilterCourse("");
              }}
              className="bg-background/50 border border-border px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl focus:border-primary outline-none transition-all"
            >
              <option value="">All Programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.title}
                </option>
              ))}
            </select>
            <select
              title="Level"
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              disabled={!filterProgram}
              className="bg-background/50 border border-border px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl focus:border-primary outline-none transition-all disabled:opacity-30"
            >
              <option value="">All Levels</option>
              {availableCourses.map((c: any) => (
                <option key={c.id} value={c.id}>
                  Level {c.level_order}
                </option>
              ))}
            </select>
            <select
              title="Term"
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="bg-background/50 border border-border px-4 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl focus:border-primary outline-none transition-all"
            >
              {termOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary bar */}
        {enrollments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-4">
            <div className="bg-card border border-border p-6 rounded-[2rem] shadow-lg flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                  Students
                </p>
                <p className="text-3xl font-black text-foreground tracking-tighter">
                  {enrollments.length}
                </p>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground mt-2">
                Active enrollments in this filter
              </p>
            </div>

            <div className="bg-card border border-border p-6 rounded-[2rem] shadow-lg flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                  Ready to save
                </p>
                <p className="text-3xl font-black text-primary tracking-tighter">
                  {decidedCount}
                </p>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground mt-2">
                {decidedCount} decisions staged
              </p>
            </div>

            {/* Smart Suggestions Auto-Apply */}
            <div className="bg-card border border-border p-6 rounded-[2rem] shadow-lg flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">
                  Smart Suggestions
                </p>
                <p className="text-xs font-bold text-muted-foreground mt-1">
                  Suggest promotion based on academic results & track
                  completions.
                </p>
              </div>
              <button
                onClick={() => {
                  const all: Record<string, PromotionDecision> = {};
                  pending.forEach((e) => {
                    const course = (e as any).courses;
                    const report = reports[e.student_id];
                    const rec = getSmartRecommendation(
                      report?.overall_grade,
                      !!course?.next_course_id
                    );
                    all[e.id] = rec.decision;
                  });
                  setDecisions(all);
                }}
                disabled={reportsLoading}
                className="mt-4 w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10 disabled:opacity-40"
              >
                <SparklesIcon className="w-3.5 h-3.5 shrink-0 animate-spin-slow" />
                {reportsLoading
                  ? "Loading standing..."
                  : "Apply Recommendations"}
              </button>
            </div>

            <div className="bg-card border border-border p-6 rounded-[2rem] shadow-lg flex flex-col justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
                  Manual Bulk Override
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(
                    ["promote", "repeat", "complete"] as PromotionDecision[]
                  ).map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        const all: Record<string, PromotionDecision> = {};
                        pending.forEach((e) => {
                          all[e.id] = d;
                        });
                        setDecisions(all);
                      }}
                      className="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest border border-border hover:border-primary hover:text-primary transition-all rounded-lg"
                    >
                      {DECISION_META[d].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-4 pt-2 border-t border-border/40">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  Staged:
                </span>
                <div className="flex gap-1">
                  {decisionCounts.map(({ d, count }) => (
                    <span
                      key={d}
                      className={`px-2 py-0.5 rounded border text-[9px] font-black ${DECISION_META[d].cls}`}
                      title={`${count} ${DECISION_META[d].label}`}
                    >
                      {count} {DECISION_META[d].label.charAt(0)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enrollment Grid */}
        {loading ? (
          <div className="py-40 text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Loading students…
            </p>
          </div>
        ) : enrollments.length === 0 ? (
          <div className="py-32 text-center bg-card border border-dashed border-border rounded-[3rem] mx-4 space-y-6">
            <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto border border-border">
              <UserGroupIcon className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-black text-foreground">
                No students found
              </p>
              <p className="text-sm text-muted-foreground">
                No active enrollments match your current filter.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4">
            {enrollments.map((enrollment) => {
              const student = (enrollment as any).portal_users;
              const course = (enrollment as any).courses;
              const isProcessed = submitted.includes(enrollment.id);
              const decision = decisions[enrollment.id];

              const report = reports[enrollment.student_id];
              const rec = getSmartRecommendation(
                report?.overall_grade,
                !!course?.next_course_id
              );

              return (
                <div
                  key={enrollment.id}
                  className={`group relative bg-card border rounded-[2.5rem] p-8 transition-all duration-500 shadow-xl overflow-hidden flex flex-col justify-between min-h-[300px] ${
                    isProcessed
                      ? "border-emerald-500/20 opacity-60 grayscale"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3
                            className="text-lg font-black text-foreground tracking-tight group-hover:text-primary transition-colors truncate max-w-[200px]"
                            title={student?.full_name}
                          >
                            {student?.full_name ?? "Anonymous Student"}
                          </h3>
                          {enrollment.start_week > 1 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Mid-Term Join
                            </span>
                          )}
                          {report?.overall_grade ? (
                            <span
                              className="px-2 py-0.5 rounded bg-emerald-500/10 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              title={`Overall score: ${report.overall_grade}`}
                            >
                              Grade: {report.overall_grade}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-zinc-500/10 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border border-zinc-500/20">
                              No Grade Yet
                            </span>
                          )}
                          {report && (
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                                report.is_published
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              }`}
                              title={
                                report.report_period ||
                                report.report_term ||
                                "Latest report"
                              }
                            >
                              {report.is_published ? "Published" : "Draft"}
                              {typeof report.overall_score === "number"
                                ? ` · ${Math.round(report.overall_score)}%`
                                : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest shrink-0">
                            Level {course?.level_order ?? "?"}
                          </span>
                          <span className="text-muted-foreground/30 text-[10px]">
                            •
                          </span>
                          <span
                            className="text-[10px] font-black text-muted-foreground uppercase tracking-widest truncate max-w-[200px]"
                            title={course?.title}
                          >
                            {course?.title ?? "Unknown Course"}
                          </span>
                        </div>
                      </div>

                      {decision && (
                        <div
                          className={`px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest shadow-lg ${DECISION_META[decision].cls}`}
                        >
                          {DECISION_META[decision].label}
                        </div>
                      )}
                    </div>

                    {/* Smart recommendation statement block */}
                    <div
                      className={`flex items-start gap-2.5 p-3 rounded-2xl border text-[11px] leading-relaxed font-semibold transition-all ${
                        decision ? "opacity-40" : ""
                      } ${rec.cls}`}
                    >
                      <SparklesIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black uppercase tracking-wider block text-[9px] mb-0.5">
                          Academic Auditor Suggestion
                        </span>
                        {rec.desc}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-border bg-background/40 p-3">
                        <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                          Report Evidence
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-foreground">
                          {report
                            ? `${report.is_published ? "Published" : "Draft"}${
                                report.report_term
                                  ? ` · ${report.report_term}`
                                  : ""
                              }`
                            : "No report yet"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-background/40 p-3">
                        <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                          Score Basis
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-foreground">
                          {report?.overall_grade ||
                          typeof report?.overall_score === "number"
                            ? `${report.overall_grade || "Grade"}${
                                typeof report.overall_score === "number"
                                  ? ` · ${Math.round(report.overall_score)}%`
                                  : ""
                              }`
                            : "Awaiting grading"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-background/40 p-3">
                        <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                          Next Step
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-foreground">
                          {course?.next_course_id
                            ? `Level ${(course?.level_order ?? 0) + 1}`
                            : "Complete course"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
                        If promoted
                      </p>
                      <p className="text-[10px] font-bold text-foreground">
                        {course?.next_course_id
                          ? `Moves to Level ${(course?.level_order ?? 0) + 1}`
                          : "Final level — course complete"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {canPromote && student?.id && (
                        <Link
                          href={`/dashboard/reports/builder?student_id=${student.id}`}
                          className="p-3 rounded-xl border border-border bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all shadow-sm"
                          title="View report card"
                        >
                          <DocumentChartBarIcon className="w-4 h-4" />
                        </Link>
                      )}
                      {!isProcessed && canPromote && (
                        <div className="flex gap-1.5 ml-2">
                          {(
                            [
                              "promote",
                              "repeat",
                              "withdraw",
                            ] as PromotionDecision[]
                          ).map((d) => {
                            const m = DECISION_META[d];
                            const Icon = m.icon;
                            const active = decision === d;
                            if (d === "promote" && !course?.next_course_id)
                              return null;
                            return (
                              <button
                                key={d}
                                onClick={() =>
                                  setDecisions((prev) => ({
                                    ...prev,
                                    [enrollment.id]: d,
                                  }))
                                }
                                className={`p-3 rounded-xl border transition-all shadow-sm ${
                                  active
                                    ? m.cls + " ring-2 ring-current"
                                    : "border-border text-muted-foreground hover:bg-muted/30"
                                }`}
                                title={m.label}
                              >
                                <Icon className="w-4 h-4" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 flex items-start gap-4 px-6 py-4 bg-rose-500/5 border border-rose-500/20 rounded-[2rem] text-rose-600 dark:text-rose-400 text-sm shadow-xl">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-black uppercase tracking-widest text-xs">
              Some decisions could not be saved
            </p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Save decisions button — appears when decisions are ready */}
      {canPromote && decidedCount > 0 && (
        <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-3 sm:px-4 z-50 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <button
            onClick={submitAll}
            disabled={submitting}
            className="w-full py-4 sm:py-6 bg-primary hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-primary-foreground rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_20px_50px_rgba(124,58,237,0.4)] transition-all flex items-center justify-center gap-3 sm:gap-4 group overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

            {submitting ? (
              <>
                <div className="w-5 h-5 border-3 border-white/60 border-t-white rounded-full animate-spin" />
                <span className="font-black uppercase tracking-widest sm:tracking-[0.2em] text-[11px] sm:text-xs">
                  Saving…
                </span>
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                <span className="font-black uppercase tracking-widest sm:tracking-[0.2em] text-[11px] sm:text-xs">
                  <span className="sm:hidden">Save {decidedCount}</span>
                  <span className="hidden sm:inline">
                    Save {decidedCount} decision{decidedCount !== 1 ? "s" : ""}{" "}
                    → {nextTerm(filterTerm, termOptions)}
                  </span>
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
