import { isManualWrittenQuestion, type WrittenQuestion } from './written-grading';

export function writtenQuestionDefinitionError(question: WrittenQuestion): string | null {
  if (Number(question.points ?? 0) <= 0) return 'Every question must have a positive point value.';
  const type = String(question.question_type ?? '').toLowerCase();
  if (type === 'multiple_choice') {
    const options = Array.isArray(question.options)
      ? question.options.filter(option => typeof option === 'string' && option.trim())
      : [];
    if (options.length < 2) return 'Every multiple-choice question must provide at least two options.';
    if (new Set(options.map(option => String(option).trim().toLowerCase())).size !== options.length) {
      return 'Multiple-choice options must be unique.';
    }
  }
  if (!isManualWrittenQuestion(question) && String(question.correct_answer ?? '').trim() === '') {
    return 'Every automatically graded question must have an approved correct answer.';
  }
  return null;
}

export function writtenPaperDefinitionError(questions: WrittenQuestion[]): string | null {
  if (!questions.length) return 'Add at least one question before activating this exam.';
  for (const question of questions) {
    const error = writtenQuestionDefinitionError(question);
    if (error) return error;
  }
  return null;
}
