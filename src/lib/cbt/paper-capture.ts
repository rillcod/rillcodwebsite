/** Hall / print sittings land on the same cbt_sessions row as a CBT sit. */

export const PAPER_CAPTURE = "paper";

export function isPaperCaptureAnswers(answers: unknown): boolean {
  return (
    !!answers &&
    typeof answers === "object" &&
    !Array.isArray(answers) &&
    (answers as Record<string, unknown>).capture === PAPER_CAPTURE
  );
}

export function sessionAllowsPaperOverwrite(session: {
  answers?: unknown;
  status?: unknown;
} | null | undefined): boolean {
  if (!session) return true;
  if (isPaperCaptureAnswers(session.answers)) return true;
  const answers = session.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return true;
  return Object.keys(answers).every((key) => key === "capture");
}

export function clampPaperPercent(value: unknown): number | null {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function paperCaptureStatus(
  score: number,
  passingScore?: number | null,
): "passed" | "failed" {
  return score >= Number(passingScore ?? 70) ? "passed" : "failed";
}

export function paperCaptureSessionFields(input: {
  examId: string;
  userId: string;
  score: number;
  passingScore?: number | null;
  earned?: number;
  max?: number;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  return {
    exam_id: input.examId,
    user_id: input.userId,
    start_time: now,
    end_time: now,
    score: input.score,
    status: paperCaptureStatus(input.score, input.passingScore),
    answers: {
      capture: PAPER_CAPTURE,
      ...(input.earned != null && input.max != null
        ? { earned: input.earned, max: input.max }
        : {}),
    },
    manual_scores: {},
    needs_grading: false,
    grading_notes: "Paper mark recorded from the hall.",
    updated_at: now,
  };
}
