/**
 * Host First Test / Second Test / Examination are generated from weeks this
 * class already marked taught. Questions go through the existing CBT writer
 * and print sheet — teachers do not type a paper or a second gradebook.
 */

import {
  classifyCalendarWeek,
  type TermActivity,
  type WeekCalendarRole,
} from "@/lib/academic/school-programme-standing";
import {
  hostAssessmentKindFromExam,
  hostAssessmentMetricFields,
  hostMarksFromCbtSessions,
  hostSchoolTotal,
  hostTestsCombined,
  parseHostAssessmentKind,
  type HostAssessmentKind,
  type HostPaperMarks,
} from "@/lib/academic/host-marks";

export { hostAssessmentMetricFields };

export type { HostAssessmentKind };
export { hostAssessmentKindFromExam, parseHostAssessmentKind };

export type TaughtWeekTopic = {
  week: number;
  taught?: boolean;
  topic?: string;
};

export type TaughtAssessmentBrief = {
  kind: HostAssessmentKind;
  title: string;
  topic: string;
  sourceMaterial: string;
  topics: string[];
  sit: "cbt" | "print";
  examType: "evaluation" | "examination";
};

function addCalendarDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date + days));
  return utc.toISOString().slice(0, 10);
}

function weekWindow(termStart: string, weekNumber: number): { start: string; end: string } {
  const start = addCalendarDays(termStart, (Math.max(1, weekNumber) - 1) * 7);
  return { start, end: addCalendarDays(start, 6) };
}

function overlaps(
  activity: TermActivity,
  window: { start: string; end: string },
): boolean {
  return !(activity.end < window.start || activity.start > window.end);
}

function firstTestWeekNumber(
  termStart: string | null | undefined,
  activities: TermActivity[] | null | undefined,
): number | null {
  if (!termStart) return null;
  const first = (activities ?? []).find((row) => row.kind === "first_test");
  if (!first) return null;
  for (let week = 1; week <= 20; week += 1) {
    const window = weekWindow(termStart, week);
    if (overlaps(first, window)) return week;
  }
  return null;
}

export function hostAssessmentKindForWeek(input: {
  calendarRole?: WeekCalendarRole | null;
  weekNumber: number;
  termStart?: string | null;
  activities?: TermActivity[] | null;
}): HostAssessmentKind | null {
  if (input.calendarRole === "examination") return "examination";
  const activities = input.activities ?? [];
  if (input.termStart && activities.length > 0) {
    const window = weekWindow(input.termStart, input.weekNumber);
    if (activities.some((row) => row.kind === "examination" && overlaps(row, window))) {
      return "examination";
    }
    if (activities.some((row) => row.kind === "second_test" && overlaps(row, window))) {
      return "second_test";
    }
    if (activities.some((row) => row.kind === "first_test" && overlaps(row, window))) {
      return "first_test";
    }
  }
  if (input.calendarRole === "school_test") {
    const firstWeek = firstTestWeekNumber(input.termStart, input.activities);
    if (firstWeek != null && input.weekNumber > firstWeek) return "second_test";
    return "first_test";
  }
  return null;
}

export function taughtTopicsForHostAssessment(input: {
  weeks: TaughtWeekTopic[];
  kind: HostAssessmentKind;
  assessmentWeek: number;
  termStart?: string | null;
  activities?: TermActivity[] | null;
}): string[] {
  const firstTestWeek = firstTestWeekNumber(input.termStart, input.activities);
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const row of input.weeks) {
    if (!row.taught) continue;
    const week = Number(row.week);
    if (!Number.isFinite(week) || week >= input.assessmentWeek) continue;
    if (
      input.kind === "second_test" &&
      firstTestWeek != null &&
      week <= firstTestWeek
    ) {
      continue;
    }
    const topic = String(row.topic ?? "").trim();
    if (!topic) continue;
    const key = `${week}:${topic.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(`Week ${week}: ${topic}`);
  }
  return topics;
}

export function taughtAssessmentBrief(input: {
  weeks: TaughtWeekTopic[];
  calendarRole?: WeekCalendarRole | null;
  weekNumber: number;
  termStart?: string | null;
  activities?: TermActivity[] | null;
  sit?: "cbt" | "print";
  courseName?: string | null;
}): TaughtAssessmentBrief | null {
  const kind = hostAssessmentKindForWeek(input);
  if (!kind) return null;
  const topics = taughtTopicsForHostAssessment({
    weeks: input.weeks,
    kind,
    assessmentWeek: input.weekNumber,
    termStart: input.termStart,
    activities: input.activities,
  });
  const label =
    kind === "examination"
      ? "Examination"
      : kind === "second_test"
        ? "Second Test"
        : "First Test";
  const course = String(input.courseName ?? "Coding").trim() || "Coding";
  const coverage =
    topics.length > 0
      ? topics.join("\n")
      : "No weeks have been marked taught yet.";
  return {
    kind,
    title: `${course} — ${label}`,
    topic: `${label} covering what this class has already been taught`,
    sourceMaterial: `Generate this ${label} ONLY from the weeks already taught in this class. Do not introduce untaught topics.\n\n${coverage}`,
    topics,
    sit: input.sit ?? "print",
    examType: kind === "examination" ? "examination" : "evaluation",
  };
}

export function hostAssessmentSit(
  calendarRole: WeekCalendarRole | null | undefined,
  policy?: { examCapture?: unknown; testCapture?: unknown } | null,
): "cbt" | "print" {
  if (calendarRole === "examination") {
    return policy?.examCapture === "cbt" ? "cbt" : "print";
  }
  if (calendarRole === "school_test") {
    return policy?.testCapture === "cbt" ? "cbt" : "print";
  }
  return "print";
}

export function isHostAssessmentWeek(
  role: WeekCalendarRole | null | undefined,
): boolean {
  return role === "school_test" || role === "examination";
}

/** Keep classify in one place so tests can assert the calendar still drives kind. */
export function calendarRoleForTaughtWeek(input: {
  standing: "optional" | "compulsory";
  termStart?: string | null;
  weekNumber: number;
  activities?: TermActivity[] | null;
}): WeekCalendarRole {
  return classifyCalendarWeek(input);
}

export type HostAssessmentScores = {
  first_test: number | null;
  second_test: number | null;
  examination: number | null;
};

function percentsFromPapers(papers: HostPaperMarks): HostAssessmentScores {
  return {
    first_test: papers.first_test?.percent ?? null,
    second_test: papers.second_test?.percent ?? null,
    examination: papers.examination?.percent ?? null,
  };
}

export function hostScoresFromCbtSessions(
  rows: Parameters<typeof hostMarksFromCbtSessions>[0],
): HostAssessmentScores {
  return percentsFromPapers(hostMarksFromCbtSessions(rows));
}

export function hostTestAverage(scores: HostAssessmentScores): number | null {
  const tests = [scores.first_test, scores.second_test].filter(
    (value): value is number => value != null,
  );
  if (tests.length === 0) return null;
  return Math.round(tests.reduce((sum, value) => sum + value, 0) / tests.length);
}

export function applyHostAssessmentToReportScores(input: {
  rows: Parameters<typeof hostMarksFromCbtSessions>[0];
  examinationFallback: number;
  evaluationFallback: number;
  /** Optional 6-box only. Compulsory papers stay in host fields, not theory/assessment. */
  mapIntoSixBox?: boolean;
}): {
  theory: number;
  assessment: number;
  host: HostAssessmentScores;
  papers: HostPaperMarks;
  total: ReturnType<typeof hostSchoolTotal>;
} {
  const papers = hostMarksFromCbtSessions(input.rows);
  const host = percentsFromPapers(papers);
  const mapIntoSixBox = input.mapIntoSixBox !== false;
  return {
    host,
    papers,
    total: hostSchoolTotal(papers),
    theory: mapIntoSixBox
      ? papers.examination?.percent ?? input.examinationFallback
      : input.examinationFallback,
    assessment: mapIntoSixBox
      ? hostTestsCombined(papers)?.percent ?? input.evaluationFallback
      : input.evaluationFallback,
  };
}

