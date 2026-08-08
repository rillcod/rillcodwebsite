import { isCbtAnswerCorrect, isManualCbtQuestion, type CbtGradeQuestion } from '@/lib/cbt/grading';

export const WRITTEN_GRADING_META_KEY = '__grading';

export type WrittenQuestion = CbtGradeQuestion;

export type WrittenGradingMetadata = {
  version: 1;
  objective_score: number;
  manual_scores: Record<string, number>;
  feedback: string | null;
};

export type WrittenGrade = {
  score: number;
  totalPoints: number;
  percentage: number;
  status: 'submitted' | 'graded';
  objectiveScore: number;
  manualScores: Record<string, number>;
  manualQuestionIds: string[];
};

export class WrittenGradingError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isManualWrittenQuestion(question: WrittenQuestion): boolean {
  const type = String(question.question_type ?? '').toLowerCase();
  return isManualCbtQuestion(question) || type === 'short_answer' || type === 'fill_in_blank';
}

/** Student answers only. Server-owned grading evidence can never be supplied by the learner. */
export function stripWrittenGradingMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== WRITTEN_GRADING_META_KEY));
}

export function readWrittenGradingMetadata(value: unknown): WrittenGradingMetadata {
  const raw = isRecord(value) && isRecord(value[WRITTEN_GRADING_META_KEY])
    ? value[WRITTEN_GRADING_META_KEY]
    : {};
  const rawScores = isRecord(raw.manual_scores) ? raw.manual_scores : {};
  const manualScores: Record<string, number> = {};
  for (const [id, score] of Object.entries(rawScores)) {
    const parsed = Number(score);
    if (Number.isFinite(parsed) && parsed >= 0) manualScores[id] = parsed;
  }
  return {
    version: 1,
    objective_score: Number.isFinite(Number(raw.objective_score)) ? Number(raw.objective_score) : 0,
    manual_scores: manualScores,
    feedback: typeof raw.feedback === 'string' ? raw.feedback : null,
  };
}

export function gradeWrittenAnswers(
  questions: WrittenQuestion[],
  answers: Record<string, unknown>,
  existingManualScores: Record<string, number> = {},
  incomingManualScores: Record<string, unknown> = {},
): WrittenGrade {
  if (questions.length === 0) throw new WrittenGradingError('This written exam has no questions.');

  const manualQuestions = questions.filter(isManualWrittenQuestion);
  const manualById = new Map(manualQuestions.map((question) => [question.id, question]));
  const manualScores: Record<string, number> = {};

  for (const [id, rawScore] of Object.entries({ ...existingManualScores, ...incomingManualScores })) {
    const question = manualById.get(id);
    if (!question) throw new WrittenGradingError('A score was supplied for an unknown or automatically graded question.');
    const score = Number(rawScore);
    const maximum = Math.max(0, Number(question.points ?? 0));
    if (!Number.isFinite(score) || score < 0 || score > maximum) {
      throw new WrittenGradingError(`Score for question ${id} must be between 0 and ${maximum}.`);
    }
    manualScores[id] = score;
  }

  const totalPoints = questions.reduce((sum, question) => sum + Math.max(0, Number(question.points ?? 0)), 0);
  if (totalPoints <= 0) throw new WrittenGradingError('This written exam has no available points.');

  const objectiveScore = questions.reduce((sum, question) => {
    if (isManualWrittenQuestion(question)) return sum;
    return sum + (isCbtAnswerCorrect(question, answers[question.id]) ? Math.max(0, Number(question.points ?? 0)) : 0);
  }, 0);
  const manualScore = Object.values(manualScores).reduce((sum, score) => sum + score, 0);
  const score = objectiveScore + manualScore;
  const complete = manualQuestions.every((question) => Object.prototype.hasOwnProperty.call(manualScores, question.id));

  return {
    score,
    totalPoints,
    percentage: Math.round((score / totalPoints) * 10_000) / 100,
    status: complete ? 'graded' : 'submitted',
    objectiveScore,
    manualScores,
    manualQuestionIds: manualQuestions.map((question) => question.id),
  };
}

export function withWrittenGradingMetadata(
  answers: Record<string, unknown>,
  grade: WrittenGrade,
  feedback: string | null,
): Record<string, unknown> {
  return {
    ...stripWrittenGradingMetadata(answers),
    [WRITTEN_GRADING_META_KEY]: {
      version: 1,
      objective_score: grade.objectiveScore,
      manual_scores: grade.manualScores,
      feedback,
    } satisfies WrittenGradingMetadata,
  };
}
