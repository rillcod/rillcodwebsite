import { describe, expect, it } from 'vitest';
import {
  WrittenGradingError,
  gradeWrittenAnswers,
  readWrittenGradingMetadata,
  stripWrittenGradingMetadata,
  withWrittenGradingMetadata,
} from './written-grading';

const questions = [
  { id: 'objective', question_type: 'multiple_choice', options: ['Lagos', 'Abuja'], correct_answer: 'Abuja', points: 2 },
  { id: 'essay', question_type: 'essay', correct_answer: null, points: 8 },
];

describe('written exam grading', () => {
  it('keeps the exam pending until every manual score is recorded', () => {
    const grade = gradeWrittenAnswers(questions, { objective: 'B', essay: 'My answer' });
    expect(grade).toMatchObject({ score: 2, totalPoints: 10, percentage: 20, status: 'submitted' });
  });

  it('recomputes idempotently instead of adding a retry to the previous total', () => {
    const first = gradeWrittenAnswers(questions, { objective: 'B' }, {}, { essay: 6 });
    const retry = gradeWrittenAnswers(questions, { objective: 'B' }, first.manualScores, { essay: 6 });
    expect(retry).toMatchObject({ score: 8, percentage: 80, status: 'graded' });
  });

  it('rejects out-of-range and objective-question manual scores', () => {
    expect(() => gradeWrittenAnswers(questions, {}, {}, { essay: 9 })).toThrow(WrittenGradingError);
    expect(() => gradeWrittenAnswers(questions, {}, {}, { objective: 2 })).toThrow(WrittenGradingError);
  });

  it('keeps server grading evidence separate from learner answers', () => {
    const grade = gradeWrittenAnswers(questions, { objective: 'B' }, {}, { essay: 7 });
    const stored = withWrittenGradingMetadata({ objective: 'B', __grading: { forged: true } }, grade, 'Clear work');
    expect(stripWrittenGradingMetadata(stored)).toEqual({ objective: 'B' });
    expect(readWrittenGradingMetadata(stored)).toMatchObject({ manual_scores: { essay: 7 }, feedback: 'Clear work' });
  });
});
