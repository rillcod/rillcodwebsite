import { normalizeCbtOptions, OPT_LABELS } from './print-utils';

export type CbtGradeQuestion = {
  id: string;
  question_type?: string | null;
  options?: unknown;
  correct_answer?: string | null;
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
  return ['essay', 'fill_blank', 'coding_blocks'].includes((type ?? '').toLowerCase());
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
  const manualQuestions = questions.filter((q) => isManualCbtQuestion(q));
  const autoQuestions = questions.filter((q) => !isManualCbtQuestion(q));
  const totalPoints = questions.reduce((sum, q) => sum + Number(q.points ?? 0), 0);
  const sectionWeights: Record<string, number> = exam?.metadata?.section_weights ?? {};
  const hasWeights = Object.values(sectionWeights).some((w: any) => Number(w) > 0);

  let correct = 0;
  let earnedPoints = 0;

  for (const q of autoQuestions) {
    if (isCbtAnswerCorrect(q, answers[q.id])) {
      correct++;
      earnedPoints += Number(q.points ?? 0);
    }
  }

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
      const sectionEarned = sectionQuestions.reduce((sum, q) => {
        if (isManualCbtQuestion(q)) return sum;
        return isCbtAnswerCorrect(q, answers[q.id]) ? sum + Number(q.points ?? 0) : sum;
      }, 0);
      const normalizedWeight = activeWeightTotal > 0 ? (sectionWeight / activeWeightTotal) * 100 : sectionWeight;
      score += sectionTotal > 0 ? (sectionEarned / sectionTotal) * normalizedWeight : 0;
    }
    score = Math.round(score);
  } else {
    score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  }

  const needsGrading = manualQuestions.length > 0;
  const passed = score >= Number(exam?.passing_score ?? 70);
  return {
    score,
    correct,
    needsGrading,
    manualQuestionCount: manualQuestions.length,
    status: needsGrading ? 'pending_grading' : (passed ? 'passed' : 'failed'),
    manualScores: Object.fromEntries(manualQuestions.map((q) => [q.id, null])),
  };
}
