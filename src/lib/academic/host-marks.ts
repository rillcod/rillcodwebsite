/**
 * Central plug for compulsory school papers on the Rillcod record.
 *
 * First Test, Second Test and Examination each use the total the teacher set
 * for that paper. Those marks add together. Classwork, assignments and
 * projects sit beside that total on the same progress report — they complete
 * the picture; they are not mixed into it.
 */

import { parseScoreAuthority } from "@/lib/reports/complement";

export type HostAssessmentKind = "first_test" | "second_test" | "examination";

export function parseHostAssessmentKind(value: unknown): HostAssessmentKind | null {
  return value === "first_test" || value === "second_test" || value === "examination"
    ? value
    : null;
}

export function hostAssessmentKindFromExam(exam: {
  title?: unknown;
  metadata?: unknown;
}): HostAssessmentKind | null {
  const metadata =
    exam.metadata && typeof exam.metadata === "object" && !Array.isArray(exam.metadata)
      ? (exam.metadata as Record<string, unknown>)
      : {};
  const tagged = parseHostAssessmentKind(metadata.host_assessment);
  if (tagged) return tagged;
  const title = String(exam.title ?? "");
  if (/second\s*test/i.test(title)) return "second_test";
  if (/first\s*test/i.test(title)) return "first_test";
  if (/examination/i.test(title)) return "examination";
  return null;
}

/** Hint only when a new paper has no questions yet. Never a lock. */
export const SUGGESTED_HOST_PAPER_MAX: Record<HostAssessmentKind, number> = {
  first_test: 20,
  second_test: 20,
  examination: 60,
};

/** @deprecated Use SUGGESTED_HOST_PAPER_MAX — paper totals are teacher-set. */
export const HOST_PAPER_MAX = SUGGESTED_HOST_PAPER_MAX;

export const HOST_TOTAL_MAX = 100;

export type HostMark = {
  earned: number;
  max: number;
  percent: number;
};

export type HostPaperMarks = Record<HostAssessmentKind, HostMark | null>;

const HOST_SCORE_READY = new Set(["completed", "passed", "failed", "pending_grading"]);

export function hostPaperLabel(kind: HostAssessmentKind): string {
  if (kind === "examination") return "Examination";
  if (kind === "second_test") return "Second Test";
  return "First Test";
}

export function paperTotalFromQuestions(
  questions?: Array<{ points?: unknown }> | null,
): number | null {
  if (!questions?.length) return null;
  const total = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
  return total > 0 ? Math.round(total) : null;
}

export function hostMaxFromExam(exam: {
  metadata?: unknown;
  cbt_questions?: Array<{ points?: unknown }> | null;
}): number | null {
  const rec =
    exam.metadata && typeof exam.metadata === "object" && !Array.isArray(exam.metadata)
      ? (exam.metadata as Record<string, unknown>)
      : {};
  const tagged = Number(rec.host_max);
  if (Number.isFinite(tagged) && tagged > 0) return Math.round(tagged);
  return paperTotalFromQuestions(exam.cbt_questions);
}

export function hostMaxForKind(
  kind: HostAssessmentKind,
  metadata?: unknown,
): number | null {
  void kind;
  return hostMaxFromExam({ metadata });
}

export function markFromEarned(earned: unknown, max: unknown): HostMark | null {
  const ceiling = Number(max);
  const value = Number(earned);
  if (!Number.isFinite(ceiling) || ceiling <= 0 || !Number.isFinite(value)) return null;
  const safeMax = Math.round(ceiling);
  const safeEarned = Math.max(0, Math.min(safeMax, Math.round(value)));
  return {
    earned: safeEarned,
    max: safeMax,
    percent: Math.round((safeEarned / safeMax) * 100),
  };
}

export function markFromPercent(percent: unknown, max: unknown): HostMark | null {
  const score = Number(percent);
  const ceiling = Number(max);
  if (!Number.isFinite(score) || !Number.isFinite(ceiling) || ceiling <= 0) return null;
  const safeMax = Math.round(ceiling);
  const safePercent = Math.max(0, Math.min(100, Math.round(score)));
  return markFromEarned(Math.round((safePercent * safeMax) / 100), safeMax);
}

export function formatHostMark(mark: HostMark | null | undefined): string {
  if (!mark) return "—";
  return `${mark.earned}/${mark.max}`;
}

export function parsePaperMarkAnswers(answers: unknown): HostMark | null {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const rec = answers as Record<string, unknown>;
  if (rec.capture !== "paper") return null;
  return markFromEarned(rec.earned, rec.max);
}

/**
 * Hall entry is marks against the teacher’s paper total.
 * A value above that total is treated as a leftover 0–100 percent.
 */
export function parseHallMarkInput(
  row: { earned?: unknown; score?: unknown; max?: unknown },
  defaultMax: number,
): HostMark | null {
  const max = markFromEarned(0, row.max ?? defaultMax)?.max ?? defaultMax;
  if (row.earned != null && row.earned !== "") {
    return markFromEarned(row.earned, max);
  }
  const raw = Number(row.score);
  if (!Number.isFinite(raw)) return null;
  if (raw <= max) return markFromEarned(raw, max);
  return markFromPercent(raw, max);
}

export function emptyHostPaperMarks(): HostPaperMarks {
  return { first_test: null, second_test: null, examination: null };
}

export function hostPapersComplete(papers: HostPaperMarks): boolean {
  return Boolean(papers.first_test && papers.second_test && papers.examination);
}

export function hostMarksFromCbtSessions(
  rows: Array<{
    score?: unknown;
    status?: unknown;
    answers?: unknown;
    end_time?: unknown;
    cbt_exams?: { title?: unknown; metadata?: unknown } | null;
  }>,
): HostPaperMarks {
  const picked = emptyHostPaperMarks();
  const seen = new Map<HostAssessmentKind, { mark: HostMark; at: number }>();
  for (const row of rows) {
    const kind = hostAssessmentKindFromExam(row.cbt_exams ?? {});
    if (!kind) continue;
    if (!HOST_SCORE_READY.has(String(row.status ?? "").toLowerCase())) continue;
    const taggedMax = hostMaxFromExam({ metadata: row.cbt_exams?.metadata });
    const fromPaper = parsePaperMarkAnswers(row.answers);
    const mark =
      fromPaper ??
      (taggedMax ? markFromPercent(row.score, taggedMax) : markFromPercent(row.score, 100));
    if (!mark) continue;
    const at = new Date(String(row.end_time ?? 0)).getTime() || 0;
    const previous = seen.get(kind);
    if (
      previous &&
      (previous.mark.percent > mark.percent ||
        (previous.mark.percent === mark.percent && previous.at >= at))
    ) {
      continue;
    }
    seen.set(kind, { mark, at });
    picked[kind] = mark;
  }
  return picked;
}

export function hostSchoolTotal(papers: HostPaperMarks): HostMark | null {
  const present = (["first_test", "second_test", "examination"] as const)
    .map((kind) => papers[kind])
    .filter((mark): mark is HostMark => !!mark);
  if (present.length === 0) return null;
  const earned = present.reduce((sum, mark) => sum + mark.earned, 0);
  const max = present.reduce((sum, mark) => sum + mark.max, 0);
  return markFromEarned(earned, max);
}

export function hostTestsCombined(papers: HostPaperMarks): HostMark | null {
  return hostSchoolTotal({
    first_test: papers.first_test,
    second_test: papers.second_test,
    examination: null,
  });
}

export function hostAssessmentMetricFields(papers: HostPaperMarks) {
  const total = hostSchoolTotal(papers);
  return {
    first_test_score: papers.first_test?.percent ?? null,
    second_test_score: papers.second_test?.percent ?? null,
    examination_score: papers.examination?.percent ?? null,
    first_test_earned: papers.first_test?.earned ?? null,
    second_test_earned: papers.second_test?.earned ?? null,
    examination_earned: papers.examination?.earned ?? null,
    first_test_max: papers.first_test?.max ?? null,
    second_test_max: papers.second_test?.max ?? null,
    examination_max: papers.examination?.max ?? null,
    host_total_earned: total?.earned ?? null,
    host_total_max: total?.max ?? null,
    host_total_percent: total?.percent ?? null,
  };
}

function markFromStored(
  metrics: Record<string, unknown>,
  kind: HostAssessmentKind,
): HostMark | null {
  const earnedKey =
    kind === "first_test"
      ? "first_test_earned"
      : kind === "second_test"
        ? "second_test_earned"
        : "examination_earned";
  const maxKey =
    kind === "first_test"
      ? "first_test_max"
      : kind === "second_test"
        ? "second_test_max"
        : "examination_max";
  const percentKey =
    kind === "first_test"
      ? "first_test_score"
      : kind === "second_test"
        ? "second_test_score"
        : "examination_score";
  return (
    markFromEarned(metrics[earnedKey], metrics[maxKey]) ||
    markFromPercent(metrics[percentKey], metrics[maxKey])
  );
}

export type HostSchoolScoreboard = {
  papers: Array<{ kind: HostAssessmentKind; label: string; mark: HostMark }>;
  total: HostMark;
  complete: boolean;
};

export function hostSchoolScoreboard(metrics: unknown): HostSchoolScoreboard | null {
  if (parseScoreAuthority(metrics) !== "host_school") return null;
  const rec =
    metrics && typeof metrics === "object" && !Array.isArray(metrics)
      ? (metrics as Record<string, unknown>)
      : {};
  const papers = (["first_test", "second_test", "examination"] as const)
    .map((kind) => {
      const mark = markFromStored(rec, kind);
      return mark ? { kind, label: hostPaperLabel(kind), mark } : null;
    })
    .filter((row): row is { kind: HostAssessmentKind; label: string; mark: HostMark } => !!row);
  const derivedTotal = hostSchoolTotal({
      first_test: papers.find((row) => row.kind === "first_test")?.mark ?? null,
      second_test: papers.find((row) => row.kind === "second_test")?.mark ?? null,
      examination: papers.find((row) => row.kind === "examination")?.mark ?? null,
    });
  const storedTotal =
    markFromEarned(rec.host_total_earned, rec.host_total_max) ||
    markFromPercent(rec.host_total_percent, rec.host_total_max);
  // The paper rows are authoritative. A stored total is only a fallback for
  // older records that predate individual paper persistence.
  const total = derivedTotal || storedTotal;
  if (!total || papers.length === 0) return null;
  return {
    papers,
    total,
    complete: papers.length === 3,
  };
}

export function parentFacingOverall(input: {
  overallScore?: unknown;
  engagementMetrics?: unknown;
}): number {
  const board = hostSchoolScoreboard(input.engagementMetrics);
  if (board) return board.total.percent;
  const overall = Number(input.overallScore);
  return Number.isFinite(overall) ? overall : 0;
}

export function hostLearningEvidence(report: {
  practical_score?: unknown;
  attendance_score?: unknown;
  participation_score?: unknown;
  engagement_metrics?: unknown;
}) {
  const metrics =
    report.engagement_metrics &&
    typeof report.engagement_metrics === "object" &&
    !Array.isArray(report.engagement_metrics)
      ? (report.engagement_metrics as Record<string, unknown>)
      : {};
  const num = (value: unknown) => {
    const n = Number(value);
    return value == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, Math.round(n)));
  };
  return {
    classwork: num(metrics.classwork_score),
    practical: num(report.practical_score),
    assignments: num(report.attendance_score),
    attendance: num(report.participation_score),
  };
}
