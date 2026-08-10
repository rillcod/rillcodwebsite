export type CbtExamType = 'evaluation' | 'examination';

export type CbtEntrySuggestion = {
  label: string;
  minimumQuestions: number;
  maximumQuestions: number;
  mcqCount: number;
  theoryCount: number;
  durationMinutes: number;
  passingScore: number;
  accessWindowMinutes: number;
  boundaryNote: string;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Math.floor(value)));

/**
 * Mirrors the assessment boundaries enforced by the shared AI generator.
 * Keeping these values in a small client-safe helper lets the authoring UI
 * start with a useful draft without publishing or changing any learner score.
 */
export function buildCbtEntrySuggestion(
  examType: CbtExamType,
  counts?: { mcqCount?: number; theoryCount?: number },
): CbtEntrySuggestion {
  const evaluation = examType === 'evaluation';
  const minimumQuestions = evaluation ? 5 : 10;
  const maximumQuestions = evaluation ? 20 : 40;
  const defaultMcq = evaluation ? 10 : 20;
  const defaultTheory = evaluation ? 0 : 5;
  const mcqCount = clamp(counts?.mcqCount ?? defaultMcq, 0, maximumQuestions);
  const theoryCount = clamp(counts?.theoryCount ?? defaultTheory, 0, maximumQuestions);
  const total = mcqCount + theoryCount;
  const durationMinutes = evaluation
    ? clamp(total * 2 + theoryCount * 3, 20, 45)
    : clamp(total * 2 + theoryCount * 4, 45, 120);

  return {
    label: evaluation ? 'Evaluation / class test' : 'Main examination',
    minimumQuestions,
    maximumQuestions,
    mcqCount,
    theoryCount,
    durationMinutes,
    passingScore: evaluation ? 60 : 70,
    accessWindowMinutes: durationMinutes + 15,
    boundaryNote: evaluation
      ? 'Focused check of recent learning.'
      : 'Broad coverage with balanced difficulty.',
  };
}

