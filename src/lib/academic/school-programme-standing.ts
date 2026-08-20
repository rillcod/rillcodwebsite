/**
 * Two independent facts about a partner-school class.
 *
 * Standing is whose assessments count. Optional (unstated counts as optional)
 * follows the Rillcod way: our week package and our evaluations. Compulsory
 * schools made coding a required subject and already run First Test, Second
 * Test and Examination on their own calendar — Royhills is the snapshot, and
 * other compulsory calendars differ only a little. Rillcod CBT must not
 * replace those host tests.
 *
 * Cadence is how often the class meets. Every school class is once or twice a
 * week, never more; most meet twice, optional and compulsory alike. The
 * published timetable is still the spine for attendance.
 */

import { canonicalMeetingSession } from "@/lib/academic/session-identity";

export type ProgrammeStanding = "optional" | "compulsory";

export type WeekCalendarRole =
  | "teach"
  | "school_test"
  | "revision"
  | "examination"
  | "break";

export type TermActivityKind =
  | "resumption"
  | "holiday"
  | "first_test"
  | "second_test"
  | "midterm"
  | "revision"
  | "examination"
  | "vacation";

export type TermActivity = {
  kind: TermActivityKind;
  label: string;
  start: string;
  end: string;
};

export type AssessmentCapture = "physical" | "cbt";

export type SchoolProgrammePolicy = {
  standing: ProgrammeStanding;
  usesRillcodEvaluation: boolean;
  usesHostEvaluation: boolean;
  sessionsPerWeek: 1 | 2;
  /** Compulsory default is a printed paper. Advanced labs can sit the exam as CBT. */
  examCapture: AssessmentCapture;
  /** Compulsory tests stay physical unless a school is explicitly set to CBT. */
  testCapture: AssessmentCapture;
};

export function parseProgrammeStanding(raw: unknown): ProgrammeStanding {
  return raw === "compulsory" ? "compulsory" : "optional";
}

/** Partner-school classes meet once or twice a week. Most meet twice. Never more. */
export function schoolWeeklyCadence(raw: unknown): 1 | 2 {
  const n = Number(raw);
  return n === 1 ? 1 : 2;
}

export function parseAssessmentCapture(raw: unknown): AssessmentCapture {
  return raw === "cbt" ? "cbt" : "physical";
}

export function resolveSchoolProgrammePolicy(input: {
  programme_standing?: unknown;
  session_frequency_per_week?: unknown;
  sessions_per_week?: unknown;
  exam_capture?: unknown;
  test_capture?: unknown;
} = {}): SchoolProgrammePolicy {
  const standing = parseProgrammeStanding(input.programme_standing);
  const host = standing === "compulsory";
  return {
    standing,
    usesRillcodEvaluation: standing === "optional",
    usesHostEvaluation: host,
    sessionsPerWeek: schoolWeeklyCadence(
      input.sessions_per_week ?? input.session_frequency_per_week
    ),
    examCapture: host ? parseAssessmentCapture(input.exam_capture) : "cbt",
    testCapture: host ? parseAssessmentCapture(input.test_capture) : "cbt",
  };
}

export function policyFromClassSchool(
  school: unknown,
  sessionsPerWeek?: unknown,
): SchoolProgrammePolicy {
  const row = (Array.isArray(school) ? school[0] : school) as
    | {
        programme_standing?: unknown;
        sessions_per_week?: unknown;
        exam_capture?: unknown;
        test_capture?: unknown;
      }
    | null
    | undefined;
  return resolveSchoolProgrammePolicy({
    programme_standing: row?.programme_standing,
    sessions_per_week: sessionsPerWeek ?? row?.sessions_per_week,
    exam_capture: row?.exam_capture,
    test_capture: row?.test_capture,
  });
}

export function hostCalendarForClass(klass: {
  schools?: unknown;
  academic_terms?:
    | { start_date?: string | null; end_date?: string | null }
    | Array<{ start_date?: string | null; end_date?: string | null }>
    | null;
} | null | undefined): {
  policy: SchoolProgrammePolicy;
  termStart: string | null;
  activities: TermActivity[];
} {
  const policy = policyFromClassSchool(klass?.schools);
  const term = Array.isArray(klass?.academic_terms)
    ? klass?.academic_terms[0]
    : klass?.academic_terms;
  return {
    policy,
    termStart: term?.start_date ?? null,
    activities: policy.usesHostEvaluation
      ? defaultCompulsoryTermActivities(term?.start_date, term?.end_date)
      : [],
  };
}

function addCalendarDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date + days));
  return utc.toISOString().slice(0, 10);
}

function spanDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000);
}

function atFraction(start: string, end: string, fraction: number): string {
  const span = spanDays(start, end);
  return addCalendarDays(start, Math.round(span * fraction));
}

const NIGERIAN_TERM_HOLIDAYS: Array<{ month: number; day: number; label: string }> = [
  { month: 10, day: 1, label: "Independence Day" },
  { month: 10, day: 5, label: "World Teachers' Day" },
];

/**
 * A Royhills-shaped First Term, stretched across whatever dates the school
 * actually runs. Compulsory schools that never send a calendar still land close.
 */
export function defaultCompulsoryTermActivities(
  termStart: string | null | undefined,
  termEnd: string | null | undefined,
): TermActivity[] {
  if (!termStart || !termEnd || termEnd < termStart) return [];
  const year = Number(termStart.slice(0, 4));
  const activities: TermActivity[] = [
    { kind: "resumption", label: "Resumption", start: termStart, end: termStart },
    {
      kind: "first_test",
      label: "First Test",
      start: atFraction(termStart, termEnd, 0.45),
      end: atFraction(termStart, termEnd, 0.49),
    },
    {
      kind: "midterm",
      label: "Midterm break",
      start: atFraction(termStart, termEnd, 0.5),
      end: atFraction(termStart, termEnd, 0.54),
    },
    {
      kind: "second_test",
      label: "Second Test",
      start: atFraction(termStart, termEnd, 0.68),
      end: atFraction(termStart, termEnd, 0.73),
    },
    {
      kind: "revision",
      label: "Revision week",
      start: atFraction(termStart, termEnd, 0.83),
      end: atFraction(termStart, termEnd, 0.88),
    },
    {
      kind: "examination",
      label: "Examination",
      start: atFraction(termStart, termEnd, 0.88),
      end: atFraction(termStart, termEnd, 0.96),
    },
    { kind: "vacation", label: "Vacation", start: termEnd, end: termEnd },
  ];
  for (const holiday of NIGERIAN_TERM_HOLIDAYS) {
    const date = `${year}-${String(holiday.month).padStart(2, "0")}-${String(holiday.day).padStart(2, "0")}`;
    if (date >= termStart && date <= termEnd) {
      activities.push({
        kind: "holiday",
        label: holiday.label,
        start: date,
        end: date,
      });
    }
  }
  return activities;
}

export function parseTermActivities(raw: unknown): TermActivity[] {
  if (!Array.isArray(raw)) return [];
  const out: TermActivity[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const kind = String(rec.kind ?? "") as TermActivityKind;
    const start = String(rec.start ?? rec.date ?? "").slice(0, 10);
    const end = String(rec.end ?? rec.start ?? rec.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    if (
      ![
        "resumption",
        "holiday",
        "first_test",
        "second_test",
        "midterm",
        "revision",
        "examination",
        "vacation",
      ].includes(kind)
    ) {
      continue;
    }
    out.push({
      kind,
      label: String(rec.label ?? kind).trim() || kind,
      start,
      end: end < start ? start : end,
    });
  }
  return out;
}

const ROLE_PRIORITY: Record<WeekCalendarRole, number> = {
  examination: 5,
  school_test: 4,
  revision: 3,
  break: 2,
  teach: 1,
};

function activityRole(kind: TermActivityKind): WeekCalendarRole {
  if (kind === "first_test" || kind === "second_test") return "school_test";
  if (kind === "revision") return "revision";
  if (kind === "examination") return "examination";
  if (kind === "midterm" || kind === "holiday" || kind === "vacation") return "break";
  return "teach";
}

export function classifyCalendarWeek(input: {
  standing: ProgrammeStanding;
  termStart?: string | null;
  weekNumber: number;
  activities?: TermActivity[] | null;
}): WeekCalendarRole {
  if (input.standing !== "compulsory") return "teach";
  const activities = input.activities ?? [];
  if (!input.termStart || activities.length === 0) return "teach";
  const weekStart = addCalendarDays(input.termStart, (Math.max(1, input.weekNumber) - 1) * 7);
  const weekEnd = addCalendarDays(weekStart, 6);
  let role: WeekCalendarRole = "teach";
  for (const activity of activities) {
    if (activity.end < weekStart || activity.start > weekEnd) continue;
    const next = activityRole(activity.kind);
    if (ROLE_PRIORITY[next] > ROLE_PRIORITY[role]) role = next;
  }
  return role;
}

export function calendarRoleLabel(role: WeekCalendarRole): string | null {
  if (role === "school_test") return "School test week";
  if (role === "revision") return "Revision week";
  if (role === "examination") return "School exam week";
  if (role === "break") return "School break";
  return null;
}

/** Rillcod only prepares and teaches on host instruction weeks. */
export function rillcodTeachesThisWeek(role: WeekCalendarRole): boolean {
  return role === "teach";
}

export function recommendTeachingAction<
  T extends
    | "prepare"
    | "refresh"
    | "release"
    | "teach"
    | "assess"
    | "review_assessment"
    | "none",
>(input: {
  base: T;
  calendarRole: WeekCalendarRole;
  usesHostEvaluation: boolean;
  examCapture?: AssessmentCapture;
  testCapture?: AssessmentCapture;
}): T | "none" {
  const cbtThisWeek =
    (input.calendarRole === "examination" && input.examCapture === "cbt") ||
    (input.calendarRole === "school_test" && input.testCapture === "cbt");
  if (!rillcodTeachesThisWeek(input.calendarRole)) {
    if (
      cbtThisWeek &&
      (input.base === "assess" || input.base === "review_assessment")
    ) {
      return input.base;
    }
    return "none";
  }
  if (
    input.usesHostEvaluation &&
    !cbtThisWeek &&
    (input.base === "assess" || input.base === "review_assessment")
  ) {
    return "none";
  }
  return input.base;
}

export function keepRillcodTeachingWeeks(
  weekNumbers: number[],
  input: {
    standing: ProgrammeStanding;
    termStart?: string | null;
    activities?: TermActivity[] | null;
  },
): number[] {
  return weekNumbers.filter(
    (week) =>
      classifyCalendarWeek({
        standing: input.standing,
        termStart: input.termStart,
        weekNumber: week,
        activities: input.activities,
      }) === "teach",
  );
}

/** Split one curriculum week into the class meetings that school cadence uses. */
export function expandPlanWeeksForMeetings<T extends Record<string, unknown>>(
  weeks: T[] | null | undefined,
  sessionsPerWeek: number,
): T[] {
  const rows = Array.isArray(weeks) ? weeks : [];
  const spw = sessionsPerWeek === 2 ? 2 : 1;
  if (spw === 1 || rows.length === 0) return rows;
  const firstWeek = Number(rows[0]?.week);
  const sameWeekCount = rows.filter((row) => Number(row.week) === firstWeek).length;
  if (sameWeekCount > 1) return rows;
  if (rows.some((row) => canonicalMeetingSession(row) > 1)) return rows;
  return rows.flatMap((row) =>
    Array.from({ length: spw }, (_, index) => ({
      ...row,
      session: index + 1,
      session_number: index + 1,
    })),
  );
}
