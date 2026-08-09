import { describe, expect, it } from 'vitest';
import { writtenPaperDefinitionError, writtenQuestionDefinitionError } from './question-validation';

describe('written exam paper validation', () => {
  it('blocks empty or unscored papers', () => {
    expect(writtenPaperDefinitionError([])).toMatch(/at least one/i);
    expect(writtenQuestionDefinitionError({ id: 'q', question_type: 'essay', points: 0 })).toMatch(/positive/i);
  });

  it('requires unique MCQ options and an approved answer', () => {
    expect(writtenQuestionDefinitionError({ id: 'q', question_type: 'multiple_choice', points: 1, options: ['A', 'A'], correct_answer: 'A' })).toMatch(/unique/i);
    expect(writtenQuestionDefinitionError({ id: 'q', question_type: 'true_false', points: 1, correct_answer: null })).toMatch(/correct answer/i);
  });

  it('allows a complete objective or manual question', () => {
    expect(writtenQuestionDefinitionError({ id: 'q', question_type: 'multiple_choice', points: 2, options: ['A', 'B'], correct_answer: 'B' })).toBeNull();
    expect(writtenQuestionDefinitionError({ id: 'e', question_type: 'essay', points: 10 })).toBeNull();
  });
});
