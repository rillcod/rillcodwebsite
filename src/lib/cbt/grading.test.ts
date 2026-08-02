import { describe, expect, it } from 'vitest';
import {
  gradeCbtSubmission,
  gradeCbtWithManualScores,
  isCbtAnswerCorrect,
} from './grading';

const objective = {
  id: 'objective-1',
  question_type: 'multiple_choice',
  options: ['Paris', 'Lagos', 'Accra'],
  correct_answer: 'Paris',
  points: 4,
  metadata: { section: 'objective' },
};

const essay = {
  id: 'essay-1',
  question_type: 'essay',
  correct_answer: 'Use the rubric',
  points: 6,
  metadata: { section: 'subjective' },
};

describe('CBT grading source of truth', () => {
  it('normalizes option text, label, and one-based answer formats', () => {
    expect(isCbtAnswerCorrect(objective, 'Paris')).toBe(true);
    expect(isCbtAnswerCorrect(objective, 'A')).toBe(true);
    expect(isCbtAnswerCorrect(objective, '1')).toBe(true);
  });

  it('queues written responses until every manual score exists', () => {
    const result = gradeCbtSubmission(
      { passing_score: 70 },
      [objective, essay],
      { 'objective-1': 'A', 'essay-1': 'Learner response' },
    );
    expect(result.status).toBe('pending_grading');
    expect(result.needsGrading).toBe(true);
    expect(result.manualScores).toEqual({ 'essay-1': null });
  });

  it('clamps manual marks and finalizes through the same calculation', () => {
    const result = gradeCbtWithManualScores(
      { passing_score: 70 },
      [objective, essay],
      { 'objective-1': '1', 'essay-1': 'Learner response' },
      { 'essay-1': 99 },
    );
    expect(result.manualScores['essay-1']).toBe(6);
    expect(result.score).toBe(100);
    expect(result.status).toBe('passed');
    expect(result.needsGrading).toBe(false);
  });

  it('uses configured section weights for objective and written sections', () => {
    const result = gradeCbtWithManualScores(
      { passing_score: 70, metadata: { section_weights: { objective: 40, subjective: 60 } } },
      [objective, essay],
      { 'objective-1': 'wrong', 'essay-1': 'Learner response' },
      { 'essay-1': 6 },
    );
    expect(result.score).toBe(60);
    expect(result.status).toBe('failed');
  });
});
