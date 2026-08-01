"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import {
  ChartBarIcon,
  BookOpenIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  AcademicCapIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PresentationChartLineIcon,
  EyeIcon,
  EyeSlashIcon,
  DocumentDuplicateIcon,
} from "@/lib/icons";

// ── Nigerian Term Calendar ────────────────────────────────────────────────────
const TERM_LABELS: Record<
  number,
  { label: string; months: string; color: string }
> = {
  1: {
    label: "First Term",
    months: "Sept – Dec",
    color: "text-primary bg-primary/10 border-primary/30",
  },
  2: {
    label: "Second Term",
    months: "Jan – Mar",
    color: "text-primary   bg-primary/10   border-primary/30",
  },
  3: {
    label: "Third Term",
    months: "Apr – Jun",
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  },
};

const WEEK_TYPE_COLOR: Record<string, string> = {
  lesson: "bg-primary",
  assessment: "bg-amber-500",
  examination: "bg-rose-500",
};

interface TermProgress {
  term: number;
  title: string;
  totalWeeks: number;
  completed: number;
  pct: number;
}
interface UpcomingEvent {
  week: number;
  term: number;
  type: string;
  topic: string;
}
interface SchoolProgress {
  school_id: string | null;
  school_name: string;
  total_weeks: number;
  completed: number;
  in_progress: number;
  skipped: number;
  pct: number;
  current_week: any;
  upcoming_assessments: UpcomingEvent[];
  term_progress: TermProgress[];
  completed_weeks?: string[];
  skipped_weeks?: string[];
  in_progress_weeks?: string[];
  last_activity: string | null;
}
interface CurriculumProgress {
  curriculum_id: string;
  course_id: string;
  course_title: string;
  program_name: string;
  version: number;
  total_weeks: number;
  term_count: number;
  is_visible_to_school: boolean;
  per_school: SchoolProgress[];
}

interface ScopedStudent {
  id: string;
  school_id?: string | null;
  school_name?: string | null;
  section_class?: string | null;
}

interface SchoolClassGridCell {
  schoolId: string;
  schoolName: string;
  classLabel: string;
  studentCount: number;
  curriculaCount: number;
  completedWeeks: number;
  totalWeeks: number;
  avgPct: number;
  upcomingCount: number;
  latestActivity: string | null;
}

function pctColor(pct: number) {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-500";
  if (pct > 0) return "bg-primary";
  return "bg-muted-foreground/30";
}

function relativeTime(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CurriculumProgressPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<CurriculumProgress[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [scopedStudents, setScopedStudents] = useState<ScopedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [gridLoading, setGridLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterSchool, setFilterSchool] = useState("");
  const [filterTerm, setFilterTerm] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "progress_desc" | "progress_asc" | "recent"
  >("progress_desc");
  const [fetchError, setFetchError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isSchool = profile?.role === "school";
  const canToggle = profile?.role === "admin" || profile?.role === "teacher";

  useEffect(() => {
    if (authLoading || !profile) return;
    setLoading(true);
    setFetchError("");
    const qs = filterSchool ? `?school_id=${filterSchool}` : "";
    fetch(`/api/curricula/progress${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((j) => {
        setData(j.data ?? []);
        setSchools(j.schools ?? []);
      })
      .catch(() =>
        setFetchError("Failed to load progress data — please refresh.")
      )
      .finally(() => setLoading(false));
  }, [filterSchool, retryKey, profile?.id, authLoading]);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (isSchool) {
      setGridLoading(false);
      return;
    }
    setGridLoading(true);
    fetch("/api/portal-users?role=student&scoped=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setScopedStudents((j.data ?? []) as ScopedStudent[]))
      .catch(() => setScopedStudents([]))
      .finally(() => setGridLoading(false));
  }, [profile?.id, authLoading, isSchool]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleVisibility(currId: string, current: boolean) {
    setTogglingId(currId);
    try {
      const res = await fetch(`/api/curricula/${currId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_visible_to_school: !current }),
      });
      if (res.ok) {
        setData((prev) =>
          prev.map((c) =>
            c.curriculum_id === currId
              ? { ...c, is_visible_to_school: !current }
              : c
          )
        );
      }
    } finally {
      setTogglingId(null);
    }
  }

  // Summary stats
  const totalCurricula = data.length;
  const totalCompleted = data.reduce(
    (a, d) => a + d.per_school.reduce((b, s) => b + (s.pct === 100 ? 1 : 0), 0),
    0
  );
  const totalWeeksDelivered = data.reduce(
    (a, d) => a + d.per_school.reduce((b, s) => b + s.completed, 0),
    0
  );
  const upcomingCount = data.reduce(
    (a, d) =>
      a + d.per_school.reduce((b, s) => b + s.upcoming_assessments.length, 0),
    0
  );

  function exportDataToCsv() {
    const rows = [
      [
        "Curriculum",
        "Program",
        "School",
        "Class/Version",
        "Completed Weeks",
        "Total Weeks",
        "Progress %",
        "Last Activity",
      ],
    ];
    filteredData.forEach((curr) => {
      curr.per_school.forEach((s) => {
        rows.push([
          `"${curr.course_title}"`,
          `"${curr.program_name}"`,
          `"${s.school_name}"`,
          `v${curr.version}`,
          s.completed.toString(),
          curr.total_weeks.toString(),
          s.pct.toString() + "%",
          s.last_activity
            ? new Date(s.last_activity).toLocaleDateString()
            : "N/A",
        ]);
      });
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curriculum_delivery_progress_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let filteredData = data.filter(
    (c) =>
      (!filterTerm ||
        c.per_school.some((s) =>
          s.term_progress.find(
            (t) => t.term === Number(filterTerm) && t.completed > 0
          )
        )) &&
      (!filterQuery ||
        c.course_title.toLowerCase().includes(filterQuery.toLowerCase()) ||
        c.program_name.toLowerCase().includes(filterQuery.toLowerCase()))
  );

  filteredData = [...filteredData].sort((a, b) => {
    const aPct = a.per_school.length
      ? a.per_school.reduce((s, x) => s + x.pct, 0) / a.per_school.length
      : 0;
    const bPct = b.per_school.length
      ? b.per_school.reduce((s, x) => s + x.pct, 0) / b.per_school.length
      : 0;
    if (sortBy === "progress_desc") return bPct - aPct;
    if (sortBy === "progress_asc") return aPct - bPct;
    // recent
    const aRecent = a.per_school.reduce(
      (s, x) =>
        Math.max(s, x.last_activity ? new Date(x.last_activity).getTime() : 0),
      0
    );
    const bRecent = b.per_school.reduce(
      (s, x) =>
        Math.max(s, x.last_activity ? new Date(x.last_activity).getTime() : 0),
      0
    );
    return bRecent - aRecent;
  });

  const schoolClassGrid = useMemo(() => {
    const roster = new Map<
      string,
      { schoolName: string; classes: Map<string, number> }
    >();
    for (const student of scopedStudents) {
      const sid = student.school_id;
      if (!sid) continue;
      const schoolName =
        student.school_name?.trim() ||
        schools.find((s) => s.id === sid)?.name ||
        "Unknown school";
      const classLabel = student.section_class?.trim() || "Unassigned class";
      if (!roster.has(sid)) {
        roster.set(sid, { schoolName, classes: new Map() });
      }
      const bucket = roster.get(sid)!;
      bucket.classes.set(classLabel, (bucket.classes.get(classLabel) ?? 0) + 1);
    }

    // Keep schools visible even before student rows arrive.
    for (const s of schools) {
      if (!roster.has(s.id)) {
        roster.set(s.id, {
          schoolName: s.name,
          classes: new Map([["Unassigned class", 0]]),
        });
      }
    }

    const cells: SchoolClassGridCell[] = [];

    for (const [schoolId, schoolData] of roster) {
      const schoolRows = filteredData
        .map((curr) => {
          const row = curr.per_school.find((p) => p.school_id === schoolId);
          return row ? { curr, row } : null;
        })
        .filter(Boolean) as { curr: CurriculumProgress; row: SchoolProgress }[];

      let completedWeeks = 0;
      let totalWeeks = 0;
      let upcomingCount = 0;
      let latestActivity: string | null = null;
      for (const sr of schoolRows) {
        completedWeeks += sr.row.completed;
        totalWeeks += sr.curr.total_weeks;
        upcomingCount += sr.row.upcoming_assessments.length;
        if (
          !latestActivity ||
          (sr.row.last_activity &&
            new Date(sr.row.last_activity).getTime() >
              new Date(latestActivity).getTime())
        ) {
          latestActivity = sr.row.last_activity;
        }
      }
      const avgPct =
        totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0;
      const curriculaCount = schoolRows.length;

      const classes = Array.from(schoolData.classes.entries()).sort((a, b) => {
        const aNum = Number(a[0].replace(/\D/g, ""));
        const bNum = Number(b[0].replace(/\D/g, ""));
        if (
          Number.isFinite(aNum) &&
          Number.isFinite(bNum) &&
          !Number.isNaN(aNum) &&
          !Number.isNaN(bNum)
        )
          return aNum - bNum;
        return a[0].localeCompare(b[0]);
      });

      for (const [classLabel, studentCount] of classes) {
        cells.push({
          schoolId,
          schoolName: schoolData.schoolName,
          classLabel,
          studentCount,
          curriculaCount,
          completedWeeks,
          totalWeeks,
          avgPct,
          upcomingCount,
          latestActivity,
        });
      }
    }

    return cells.sort((a, b) => {
      if (a.schoolName !== b.schoolName)
        return a.schoolName.localeCompare(b.schoolName);
      return a.classLabel.localeCompare(b.classLabel);
    });
  }, [scopedStudents, schools, filteredData]);

  if (authLoading || !profile)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const isStaff = ["admin", "teacher", "school"].includes(profile.role ?? "");
  if (!isStaff)
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">
        Staff access required.
      </div>
    );

  return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Unified nav bar ── */}
        <div
          className={`${
            embedded ? "hidden" : "flex"
          } items-center gap-1 bg-card border border-border rounded-xl p-1 flex-wrap`}
        >
          <Link
            href="/dashboard/academic/build"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs font-bold transition-all whitespace-nowrap"
          >
            <BookOpenIcon className="w-3.5 h-3.5 shrink-0" /> Course Syllabus
          </Link>
          <span className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-black whitespace-nowrap">
            <PresentationChartLineIcon className="w-3.5 h-3.5 shrink-0" />{" "}
            Teaching Coverage
          </span>
          {canToggle && (
            <Link
              href="/dashboard/learner-progress?view=decisions"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs font-bold transition-all whitespace-nowrap"
            >
              <AcademicCapIcon className="w-3.5 h-3.5 shrink-0" /> Promotion
              Decisions
            </Link>
          )}
          <Link
            href="/dashboard/academic/build"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs font-bold transition-all whitespace-nowrap"
          >
            <BookOpenIcon className="w-3.5 h-3.5 shrink-0" /> Open Curriculum
          </Link>
        </div>

        {/* Page title */}
        <div className={embedded ? "hidden" : ""}>
          <h1 className="text-xl sm:text-2xl font-black">
            Curriculum Teaching Coverage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSchool
              ? "Your school's curriculum delivery status"
              : "Live delivery tracking across all partner schools"}
          </p>
        </div>

        {/* School visibility info banner for school role */}
        {isSchool && (
          <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm">
            <EyeIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-foreground/80">
              You can see delivery progress for curricula your teachers have
              shared with you. Contact your assigned teacher to request access
              to hidden curricula.
            </p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Active Curricula",
              value: totalCurricula,
              icon: BookOpenIcon,
              color: "text-primary",
            },
            {
              label: "Fully Completed",
              value: totalCompleted,
              icon: CheckCircleIcon,
              color: "text-emerald-600 dark:text-emerald-400",
            },
            {
              label: "Weeks Delivered",
              value: totalWeeksDelivered,
              icon: AcademicCapIcon,
              color: "text-primary",
            },
            {
              label: "Upcoming Assessments",
              value: upcomingCount,
              icon: ExclamationTriangleIcon,
              color: "text-amber-600 dark:text-amber-400",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="bg-card border border-border p-4 space-y-2"
            >
              <Icon className={`w-5 h-5 ${color}`} />
              <p className="text-2xl font-black">{value}</p>
              <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Nigerian Term Calendar Legend */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">
            Nigerian Academic Calendar:
          </span>
          {Object.entries(TERM_LABELS).map(
            ([term, { label, months, color }]) => (
              <span
                key={term}
                className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 border ${color}`}
              >
                {label} · {months}
              </span>
            )
          )}
        </div>

        {/* Filters and Actions */}
        {!isSchool && (
          <div className="bg-card border border-border p-3 rounded-xl space-y-3">
            {/* Search — full width on mobile */}
            <input
              type="text"
              placeholder="Search curricula..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-primary rounded-lg"
            />
            {/* Selects + actions — wrap on mobile */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                title="Filter by school"
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="flex-1 min-w-[130px] bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-primary rounded-lg"
              >
                <option value="">All Schools</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                title="Filter by term"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="flex-1 min-w-[120px] bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-primary rounded-lg"
              >
                <option value="">All Terms</option>
                <option value="1">First Term</option>
                <option value="2">Second Term</option>
                <option value="3">Third Term</option>
              </select>
              <select
                title="Sort by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="flex-1 min-w-[140px] bg-background border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-primary rounded-lg"
              >
                <option value="progress_desc">Progress ↓</option>
                <option value="progress_asc">Progress ↑</option>
                <option value="recent">Recent</option>
              </select>
              {(filterSchool || filterTerm || filterQuery) && (
                <button
                  onClick={() => {
                    setFilterSchool("");
                    setFilterTerm("");
                    setFilterQuery("");
                  }}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-bold transition-colors px-2 py-2 border border-rose-500/30 hover:bg-rose-500/10 rounded-lg whitespace-nowrap"
                >
                  Clear
                </button>
              )}
              <button
                onClick={exportDataToCsv}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap ml-auto"
                title="Export delivery progress to CSV"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4 shrink-0"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
        )}

        {/* School delivery cards — staff/teacher only, one card per school */}
        {!isSchool && (
          <div className="space-y-3">
            {gridLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className="h-40 bg-card/90 border border-border/80 animate-pulse rounded-2xl"
                  />
                ))}
              </div>
            ) : schoolClassGrid.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground">
                No delivery records yet.
              </div>
            ) : (
              (() => {
                // De-duplicate to one entry per school (stats are school-scoped, not class-scoped)
                const bySchool = new Map<
                  string,
                  {
                    schoolId: string;
                    schoolName: string;
                    classes: { label: string; studentCount: number }[];
                    curriculaCount: number;
                    completedWeeks: number;
                    totalWeeks: number;
                    avgPct: number;
                    upcomingCount: number;
                    latestActivity: string | null;
                  }
                >();
                for (const cell of schoolClassGrid) {
                  if (!bySchool.has(cell.schoolId)) {
                    bySchool.set(cell.schoolId, {
                      schoolId: cell.schoolId,
                      schoolName: cell.schoolName,
                      classes: [],
                      curriculaCount: cell.curriculaCount,
                      completedWeeks: cell.completedWeeks,
                      totalWeeks: cell.totalWeeks,
                      avgPct: cell.avgPct,
                      upcomingCount: cell.upcomingCount,
                      latestActivity: cell.latestActivity,
                    });
                  }
                  bySchool.get(cell.schoolId)!.classes.push({
                    label: cell.classLabel,
                    studentCount: cell.studentCount,
                  });
                }
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {Array.from(bySchool.values()).map((school) => (
                      <div
                        key={school.schoolId}
                        className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4"
                      >
                        {/* School name */}
                        <div className="flex items-center gap-2">
                          <BuildingOfficeIcon className="w-4 h-4 text-primary shrink-0" />
                          <h3 className="font-black text-sm truncate">
                            {school.schoolName}
                          </h3>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-background border border-border rounded-lg py-2">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">
                              Curricula
                            </p>
                            <p className="text-sm font-black">
                              {school.curriculaCount}
                            </p>
                          </div>
                          <div className="bg-background border border-border rounded-lg py-2">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">
                              Weeks
                            </p>
                            <p className="text-sm font-black">
                              {school.completedWeeks}/{school.totalWeeks}
                            </p>
                          </div>
                          <div className="bg-background border border-border rounded-lg py-2">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">
                              Assessments
                            </p>
                            <p className="text-sm font-black">
                              {school.upcomingCount}
                            </p>
                          </div>
                        </div>

                        {/* Delivery progress bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">
                              Delivery
                            </span>
                            <span className="font-black">{school.avgPct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pctColor(
                                school.avgPct
                              )}`}
                              style={{ width: `${school.avgPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {relativeTime(school.latestActivity)
                              ? `Last active ${relativeTime(
                                  school.latestActivity
                                )}`
                              : "No activity yet"}
                          </p>
                        </div>

                        {/* Class list */}
                        {school.classes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
                            {school.classes.map((cls) => (
                              <span
                                key={cls.label}
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-muted/40 border border-border rounded-lg"
                              >
                                {cls.label}
                                {cls.studentCount > 0 && (
                                  <span className="text-muted-foreground">
                                    · {cls.studentCount}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* ── Curriculum Adoption Analytics — admin/teacher only ── */}
        {!isSchool &&
          !loading &&
          data.length > 0 &&
          (() => {
            // Platform curricula = school_id null rows
            const platformCurricula = data.filter((c) =>
              c.per_school.some((s) => s.school_id === null)
            );
            if (platformCurricula.length === 0) return null;

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                      <DocumentDuplicateIcon className="w-4 h-4 text-primary" />
                      Platform Template Adoption
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      How many schools have cloned and are using each shared
                      Rillcod template.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {platformCurricula.map((curr) => {
                    // School versions = all rows from other curricula sharing the same course_id but with a school_id
                    const adoptedBySchools = data.filter(
                      (c) =>
                        c.course_id === curr.course_id &&
                        c.per_school.some((s) => s.school_id !== null)
                    );
                    const adoptedCount = new Set(
                      adoptedBySchools.flatMap((c) =>
                        c.per_school
                          .filter((s) => s.school_id)
                          .map((s) => s.school_id)
                      )
                    ).size;
                    const avgProgress =
                      adoptedBySchools.length > 0
                        ? Math.round(
                            adoptedBySchools
                              .flatMap((c) =>
                                c.per_school.filter((s) => s.school_id)
                              )
                              .reduce((a, s) => a + s.pct, 0) /
                              adoptedBySchools.flatMap((c) =>
                                c.per_school.filter((s) => s.school_id)
                              ).length
                          )
                        : 0;

                    return (
                      <div
                        key={curr.curriculum_id}
                        className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider truncate">
                              {curr.program_name}
                            </p>
                            <h3 className="font-black text-sm truncate leading-snug mt-0.5">
                              {curr.course_title}
                            </h3>
                          </div>
                          <span className="text-[9px] font-black px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded shrink-0">
                            Platform v{curr.version}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-background border border-border rounded-lg py-2">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">
                              Weeks
                            </p>
                            <p className="text-sm font-black">
                              {curr.total_weeks}
                            </p>
                          </div>
                          <div className="bg-background border border-border rounded-lg py-2">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">
                              Adopted
                            </p>
                            <p
                              className={`text-sm font-black ${
                                adoptedCount > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {adoptedCount}
                            </p>
                          </div>
                          <div className="bg-background border border-border rounded-lg py-2">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold">
                              Avg %
                            </p>
                            <p
                              className={`text-sm font-black ${
                                avgProgress >= 75
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : avgProgress > 0
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {adoptedCount > 0 ? `${avgProgress}%` : "—"}
                            </p>
                          </div>
                        </div>

                        {adoptedCount === 0 ? (
                          <p className="text-[10px] text-muted-foreground text-center py-1">
                            No school has cloned this template yet.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">
                                Delivery across adopters
                              </span>
                              <span className="font-black">{avgProgress}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  avgProgress >= 75
                                    ? "bg-emerald-500"
                                    : avgProgress >= 40
                                    ? "bg-amber-500"
                                    : avgProgress > 0
                                    ? "bg-primary"
                                    : "bg-muted-foreground/30"
                                }`}
                                style={{ width: `${avgProgress}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {adoptedBySchools.flatMap((c) =>
                                c.per_school
                                  .filter((s) => s.school_id)
                                  .map((s) => (
                                    <span
                                      key={s.school_id}
                                      className="text-[9px] px-1.5 py-0.5 bg-muted/40 border border-border rounded font-bold truncate max-w-[120px]"
                                    >
                                      {s.school_name}
                                    </span>
                                  ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {/* Curricula list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-card border border-rose-500/20 rounded-xl">
            <ExclamationTriangleIcon className="w-10 h-10 text-rose-600 dark:text-rose-400" />
            <p className="text-rose-600 dark:text-rose-400 font-bold text-sm">{fetchError}</p>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="text-xs px-4 py-2 border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors font-bold rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <SparklesIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No curricula found. Generate one from the Curriculum page.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredData.map((curr) => {
              const isExpanded = expanded.has(curr.curriculum_id);
              const avgPct =
                curr.per_school.length > 0
                  ? Math.round(
                      curr.per_school.reduce((a, s) => a + s.pct, 0) /
                        curr.per_school.length
                    )
                  : 0;
              const schoolCount = curr.per_school.filter(
                (s) => s.school_id
              ).length;

              return (
                <div
                  key={curr.curriculum_id}
                  className="bg-card border border-border overflow-hidden rounded-xl"
                >
                  {/* Course header */}
                  <div className="flex items-start gap-2 p-4">
                    {/* Expand toggle + course info */}
                    <button
                      onClick={() => toggleExpand(curr.curriculum_id)}
                      className="flex-1 flex items-start gap-3 hover:bg-muted/30 transition-colors text-left rounded-lg min-w-0 p-1 -m-1"
                    >
                      {/* Chevron */}
                      <div className="mt-0.5 shrink-0">
                        {isExpanded ? (
                          <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>

                      {/* Text block + progress bar */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Programme › version + hidden badge */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                            {curr.program_name}
                          </span>
                          <span className="text-muted-foreground/40 text-xs">
                            ›
                          </span>
                          <span className="text-[10px] text-primary font-bold uppercase tracking-wider">
                            v{curr.version}
                          </span>
                          {!curr.is_visible_to_school && !isSchool && (
                            <span className="text-[9px] font-black px-2 py-0.5 bg-zinc-500/10 text-muted-foreground/70 border border-zinc-500/30 uppercase tracking-wider rounded">
                              Hidden from schools
                            </span>
                          )}
                        </div>

                        {/* Course title */}
                        <h3 className="font-black text-sm sm:text-base truncate leading-snug">
                          {curr.course_title}
                        </h3>

                        {/* Meta row */}
                        <p className="text-xs text-muted-foreground">
                          {curr.term_count} term
                          {curr.term_count !== 1 ? "s" : ""} ·{" "}
                          {curr.total_weeks} weeks · {schoolCount} school
                          {schoolCount !== 1 ? "s" : ""}
                        </p>

                        {/* Progress bar — always visible, full width */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pctColor(
                                avgPct
                              )}`}
                              style={{ width: `${avgPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-black text-foreground shrink-0 tabular-nums">
                            {avgPct}% avg
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Visibility toggle — teachers/admins only */}
                    {canToggle && (
                      <button
                        onClick={() =>
                          toggleVisibility(
                            curr.curriculum_id,
                            curr.is_visible_to_school
                          )
                        }
                        disabled={togglingId === curr.curriculum_id}
                        title={
                          curr.is_visible_to_school
                            ? "Hide from schools"
                            : "Show to schools"
                        }
                        className={`p-2 rounded-lg border transition-all shrink-0 mt-0.5 ${
                          curr.is_visible_to_school
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                            : "border-zinc-500/30 bg-zinc-500/10 text-muted-foreground/70 hover:bg-zinc-500/20"
                        } disabled:opacity-40`}
                      >
                        {togglingId === curr.curriculum_id ? (
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : curr.is_visible_to_school ? (
                          <EyeIcon className="w-4 h-4" />
                        ) : (
                          <EyeSlashIcon className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expanded: per-school rows */}
                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {curr.per_school.map((school, si) => (
                        <SchoolProgressRow
                          key={school.school_id ?? `none-${si}`}
                          school={school}
                          totalWeeks={curr.total_weeks}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── School Progress Row ───────────────────────────────────────────────────────
function SchoolProgressRow({
  school,
  totalWeeks,
}: {
  school: SchoolProgress;
  totalWeeks: number;
}) {
  const [showDetail, setShowDetail] = useState(false);

  // Delivery Pacing calculation (Pacing Forecast)
  const getPacingLabel = () => {
    if (school.pct === 0)
      return {
        label: "Not Started",
        cls: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
      };
    if (school.pct >= 90)
      return {
        label: "Completed",
        cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      };

    const term3Info = school.term_progress.find((t) => t.term === 3);
    const term2Info = school.term_progress.find((t) => t.term === 2);

    if (term3Info && term3Info.pct > 15) {
      return {
        label: "Ahead of Pace",
        cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 animate-pulse",
      };
    }
    if (term2Info && term2Info.pct < 80) {
      return {
        label: "Behind Schedule",
        cls: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
      };
    }
    return {
      label: "On Track",
      cls: "text-primary bg-primary/10 border-primary/20",
    };
  };

  const pacing = getPacingLabel();

  return (
    <div className="px-4 py-4 hover:bg-white/[0.01] transition-all">
      {/* Collapsed header: school name + progress bar + badges */}
      <div
        className="flex items-start gap-4 cursor-pointer"
        onClick={() => setShowDetail((v) => !v)}
      >
        <BuildingOfficeIcon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0 space-y-2">
          {/* School name row + pacing badge inline */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-foreground tracking-tight">
              {school.school_name}
            </p>
            <span
              className={`text-[9px] font-black px-2 py-0.5 border rounded-full uppercase tracking-wider ${pacing.cls}`}
            >
              {pacing.label}
            </span>
            {school.upcoming_assessments.length > 0 && (
              <span className="text-[9px] font-black px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider rounded-full shrink-0">
                {school.upcoming_assessments.length} upcoming assessment
                {school.upcoming_assessments.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Progress bar — always visible, full width */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pctColor(
                  school.pct
                )}`}
                style={{ width: `${school.pct}%` }}
              />
            </div>
            <span className="text-xs font-black text-foreground shrink-0 tabular-nums">
              {school.pct}%
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0 font-bold uppercase tracking-wider tabular-nums">
              {school.completed}/{totalWeeks} Weeks
            </span>
            {school.last_activity && (
              <span className="text-[10px] text-muted-foreground shrink-0 bg-muted/40 px-2 py-0.5 rounded font-bold">
                Active {relativeTime(school.last_activity)}
              </span>
            )}
          </div>
        </div>

        {showDetail ? (
          <ChevronDownIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        )}
      </div>

      {/* Detail: per-term breakdown + upcoming */}
      {showDetail && (
        <div className="mt-4 space-y-6 pl-9 border-l-2 border-border/40 ml-2.5">
          {/* Term breakdown — responsive 3-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[...school.term_progress]
              .sort((a, b) => a.term - b.term)
              .map((term) => {
                const { label, months, color } = TERM_LABELS[term.term] ?? {
                  label: `Term ${term.term}`,
                  months: "",
                  color: "text-muted-foreground bg-muted border-border",
                };
                return (
                  <div
                    key={term.term}
                    className="bg-background border border-border/80 hover:border-primary/30 p-4 space-y-3 rounded-xl transition-all shadow-sm"
                  >
                    {/* Term label badge ── full color string */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border rounded-lg ${color}`}
                      >
                        {label}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {months}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pctColor(
                          term.pct
                        )}`}
                        style={{ width: `${term.pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-muted-foreground">
                        {term.completed}/{term.totalWeeks} Weeks Covered
                      </span>
                      <span className="text-foreground">{term.pct}%</span>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Weekly Heatmap Roadmap Tracker */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
              Weekly Learning Coverage
            </h4>
            <div className="space-y-4 bg-muted/20 border border-border/50 p-4 rounded-2xl">
              {[1, 2, 3].map((termNum) => {
                const termInfo = school.term_progress.find(
                  (t) => t.term === termNum
                );
                if (!termInfo) return null;
                return (
                  <div key={termNum} className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span>Term {termNum} Coverage Tracker</span>
                      <span className="text-primary">
                        {termInfo.completed} of {termInfo.totalWeeks} weeks
                        completed
                      </span>
                    </div>
                    {/* Horizontal 12 weeks bar */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Array.from({ length: termInfo.totalWeeks || 12 }).map(
                        (_, idx) => {
                          const wk = idx + 1;
                          const key = `${termNum}-${wk}`;
                          const isCompleted =
                            school.completed_weeks?.includes(key);
                          const isSkipped = school.skipped_weeks?.includes(key);
                          const isInProgress =
                            school.in_progress_weeks?.includes(key);

                          let bgCls =
                            "border-border/60 text-muted-foreground/40 hover:border-primary/40 hover:text-foreground";
                          let statusText = "Upcoming / Planned";

                          if (isCompleted) {
                            bgCls =
                              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
                            statusText = "Completed";
                          } else if (isInProgress) {
                            bgCls =
                              "bg-primary/20 text-primary border-primary/30 animate-pulse font-black";
                            statusText = "Currently teaching";
                          } else if (isSkipped) {
                            bgCls =
                              "bg-amber-500/10 text-amber-600/80 dark:text-amber-400/80 border-amber-500/20";
                            statusText = "Skipped";
                          }

                          return (
                            <div
                              key={wk}
                              title={`Term ${termNum}, Week ${wk} • Status: ${statusText}`}
                              className={`w-8 h-8 rounded-lg border text-[10px] font-bold flex items-center justify-center transition-all cursor-default select-none ${bgCls}`}
                            >
                              {wk}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current week — "Now on" line with flex-wrap to prevent overflow */}
          {school.current_week && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs bg-primary/[0.02] border border-primary/10 p-3 rounded-xl">
              <ArrowPathIcon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground font-black uppercase tracking-wider text-[10px] shrink-0">
                Currently Scheduled:
              </span>
              <span
                className={`text-[9px] px-2 py-0.5 rounded border ${
                  TERM_LABELS[school.current_week.term]?.color ?? "bg-muted"
                } font-bold uppercase shrink-0`}
              >
                {TERM_LABELS[school.current_week.term]?.label ??
                  `Term ${school.current_week.term}`}
              </span>
              <span className="font-black text-foreground">
                Week {school.current_week.week}
              </span>
              <span className="text-muted-foreground">—</span>
              <span
                className="text-foreground font-medium truncate max-w-[300px]"
                title={school.current_week.topic}
              >
                {school.current_week.topic}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded ${
                  WEEK_TYPE_COLOR[school.current_week.type] ?? "bg-muted"
                } text-primary-foreground font-black uppercase tracking-wider shrink-0`}
              >
                {school.current_week.type}
              </span>
            </div>
          )}

          {/* Upcoming assessments */}
          {school.upcoming_assessments.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                Upcoming Assessments & Milestones
              </p>
              <div className="space-y-1.5">
                {school.upcoming_assessments.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 text-xs bg-amber-500/5 border border-amber-500/20 px-3.5 py-2.5 rounded-xl flex-wrap"
                  >
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-foreground font-bold flex-1 min-w-0 truncate">
                      {ev.topic}
                    </span>
                    <span className="text-muted-foreground font-semibold shrink-0">
                      {TERM_LABELS[ev.term]?.label ?? `Term ${ev.term}`} Wk{" "}
                      {ev.week}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 shrink-0 ${
                        ev.type === "examination"
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                      } font-black uppercase tracking-wider rounded`}
                    >
                      {ev.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped weeks */}
          {school.skipped > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/5 border border-amber-500/20 px-3 py-1.5 rounded-lg w-max font-bold">
              <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
              <span>
                {school.skipped} week(s) skipped in planning / schedules
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
