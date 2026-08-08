import { normalizeCbtOptions, OPT_LABELS } from './print-utils';

export type CbtGradeQuestion = {
  id: string;
  question_type?: string | null;
  options?: unknown;
  correct_answer?: unknown;
  points?: number | null;
  metadata?: any;
};

export function normalizeCbtAnswer(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isManualCbtQuestion(questionOrType?: CbtGradeQuestion | string | null): boolean {
  const type = typeof questionOrType === 'string'
    ? questionOrType
    : questionOrType?.question_type;
  return ['essay', 'coding_blocks', 'fill_blank'].includes((type ?? '').toLowerCase());
}

export function cbtAnswerMatchesOption(option: string, optionIndex: number, rawAnswer: unknown): boolean {
  const answer = normalizeCbtAnswer(rawAnswer);
  return answer === normalizeCbtAnswer(option)
    || answer === normalizeCbtAnswer(OPT_LABELS[optionIndex])
    || answer === String(optionIndex + 1);
}

export function isCbtAnswerCorrect(question: CbtGradeQuestion, rawAnswer: unknown): boolean {
  const answer = normalizeCbtAnswer(rawAnswer);
  const correct = normalizeCbtAnswer(question.correct_answer);
  if (!answer || !correct) return false;

  const options = normalizeCbtOptions(question.options, question.question_type);
  const labels = OPT_LABELS.map((label) => normalizeCbtAnswer(label));
  const correctOptionIndex = options.findIndex((opt) => normalizeCbtAnswer(opt) === correct);
  const correctLabelIndex = labels.findIndex((label) => label === correct);
  const answerOptionIndex = options.findIndex((opt) => normalizeCbtAnswer(opt) === answer);
  const answerLabelIndex = labels.findIndex((label) => label === answer);
  const correctValues = new Set<string>([correct]);

  if (correctOptionIndex >= 0) {
    correctValues.add(normalizeCbtAnswer(OPT_LABELS[correctOptionIndex]));
    correctValues.add(String(correctOptionIndex + 1));
  }

  if (correctLabelIndex >= 0) {
    correctValues.add(String(correctLabelIndex + 1));
    if (options[correctLabelIndex]) correctValues.add(normalizeCbtAnswer(options[correctLabelIndex]));
  }

  if (answerOptionIndex >= 0) {
    return correctValues.has(normalizeCbtAnswer(options[answerOptionIndex]))
      || correctValues.has(normalizeCbtAnswer(OPT_LABELS[answerOptionIndex]))
      || correctValues.has(String(answerOptionIndex + 1));
  }

  if (answerLabelIndex >= 0) {
    return correctValues.has(normalizeCbtAnswer(OPT_LABELS[answerLabelIndex]))
      || correctValues.has(String(answerLabelIndex + 1))
      || (options[answerLabelIndex] ? correctValues.has(normalizeCbtAnswer(options[answerLabelIndex])) : false);
  }

  return correctValues.has(answer);
}

export function gradeCbtSubmission(
  exam: any,
  questions: CbtGradeQuestion[],
  answers: Record<string, unknown>,
) {
  return gradeCbtWithManualScores(exam, questions, answers, {});
}

/** One score engine for CBT submission, teacher preview, and final manual review. */
export function gradeCbtWithManualScores(
  exam: any,
  questions: CbtGradeQuestion[],
  answers: Record<string, unknown>,
  rawManualScores: Record<string, unknown>,
) {
  const manualQuestions = questions.filter((q) => isManualCbtQuestion(q));
  const autoQuestions = questions.filter((q) => !isManualCbtQuestion(q));
  const manualScores: Record<string, number | null> = {};
  for (const question of manualQuestions) {
    const raw = rawManualScores[question.id];
    const max = Math.max(0, Number(question.points ?? 0));
    const parsed = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    manualScores[question.id] = parsed === null || !Number.isFinite(parsed)
      ? null
      : Math.max(0, Math.min(max, parsed));
  }
  const totalPoints = questions.reduce((sum, q) => sum + Number(q.points ?? 0), 0);
  const sectionWeights: Record<string, number> = exam?.metadata?.section_weights ?? {};
  const hasWeights = Object.values(sectionWeights).some((w: any) => Number(w) > 0);

  let correct = 0;

  for (const q of autoQuestions) {
    if (isCbtAnswerCorrect(q, answers[q.id])) {
      correct++;
    }
  }
  const earnedForQuestion = (question: CbtGradeQuestion): number => {
    if (isManualCbtQuestion(question)) return Number(manualScores[question.id] ?? 0);
    return isCbtAnswerCorrect(question, answers[question.id]) ? Number(question.points ?? 0) : 0;
  };
  const earnedPoints = questions.reduce((sum, q) => sum + earnedForQuestion(q), 0);

  let score = 0;
  if (hasWeights) {
    const sections = ['objective', 'subjective', 'practical'] as const;
    const activeWeightTotal = sections.reduce((sum, section) => {
      const sectionQuestions = questions.filter((q) => (q.metadata?.section ?? 'objective') === section);
      const weight = Number(sectionWeights[section] ?? 0);
      return sectionQuestions.length > 0 && weight > 0 ? sum + weight : sum;
    }, 0);

    for (const section of sections) {
      const sectionQuestions = questions.filter((q) => (q.metadata?.section ?? 'objective') === section);
      const sectionWeight = Number(sectionWeights[section] ?? 0);
      if (sectionQuestions.length === 0 || sectionWeight <= 0) continue;

      const sectionTotal = sectionQuestions.reduce((sum, q) => sum + Number(q.points ?? 0), 0);
      const sectionEarned = sectionQuestions.reduce((sum, q) => sum + earnedForQuestion(q), 0);
      const normalizedWeight = activeWeightTotal > 0 ? (sectionWeight / activeWeightTotal) * 100 : sectionWeight;
      score += sectionTotal > 0 ? (sectionEarned / sectionTotal) * normalizedWeight : 0;
    }
    score = Math.round(score);
  } else {
    score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  }

  const needsGrading = Object.values(manualScores).some((value) => value === null);
  const passed = score >= Number(exam?.passing_score ?? 70);
  return {
    score,
    correct,
    needsGrading,
    earnedPoints,
    totalPoints,
    manualQuestionCount: manualQuestions.length,
    status: needsGrading ? 'pending_grading' : (passed ? 'passed' : 'failed'),
    manualScores,
  };
}
