import { describe, expect, it } from 'vitest';
import {
  buildAssignmentGradeTransition,
  computeAssignmentWeightedScore,
  gradeAssignmentAnswers,
} from './grading';

describe('assignment grading policy', () => {
  it('keeps weighted contributions precise and server-derived', () => {
    expect(computeAssignmentWeightedScore(17, 20, 15)).toBe(12.75);
    expect(computeAssignmentWeightedScore(20, 20, 15)).toBe(15);
    expect(computeAssignmentWeightedScore(null, 20, 15)).toBeNull();
  });

  it('finalizes every numeric mark consistently', () => {
    const transition = buildAssignmentGradeTransition({
      currentGrade: null,
      currentStatus: 'submitted',
      grade: 17,
      status: 'submitted',
      maxPoints: 20,
      weight: 15,
      graderId: 'teacher-1',
      now: '2026-08-02T12:00:00.000Z',
    });
    expect(transition).toEqual({
      finalized: true,
      fields: {
        grade: 17,
        weighted_score: 12.75,
        status: 'graded',
        graded_by: 'teacher-1',
        graded_at: '2026-08-02T12:00:00.000Z',
      },
    });
  });

  it('cannot create a graded record without a numeric mark', () => {
    expect(buildAssignmentGradeTransition({
      currentGrade: null,
      currentStatus: 'submitted',
      status: 'graded',
      maxPoints: 100,
      weight: 20,
      graderId: 'teacher-1',
    }).error).toMatch(/numeric grade/i);
  });

  it('clears finalization metadata when a mark is explicitly removed', () => {
    const transition = buildAssignmentGradeTransition({
      currentGrade: 80,
      currentStatus: 'graded',
      grade: null,
      status: 'pending_review',
      maxPoints: 100,
      weight: 20,
      graderId: 'teacher-1',
    });
    expect(transition.finalized).toBe(false);
    expect(transition.fields).toMatchObject({
      grade: null,
      weighted_score: null,
      graded_by: null,
      graded_at: null,
      status: 'pending_review',
    });
  });
});

describe('assignment auto-grading', () => {
  it('accepts option text, option label, and one-based option number', () => {
    const questions = [{
      id: 'q1',
      question_type: 'multiple_choice',
      options: ['Red', 'Blue', 'Green'],
      correct_answer: 'Blue',
      points: 4,
    }];
    expect(gradeAssignmentAnswers(questions, ['B'], 20)?.grade).toBe(20);
    expect(gradeAssignmentAnswers(questions, ['2'], 20)?.grade).toBe(20);
  });

  it('does not silently finalize a mixed objective and essay assessment', () => {
    const result = gradeAssignmentAnswers([
      { id: 'q1', question_type: 'true_false', correct_answer: 'True', points: 2 },
      { id: 'q2', question_type: 'essay', correct_answer: 'Rubric evidence', points: 8 },
    ], ['true', 'Learner response'], 10);
    expect(result?.grade).toBe(10);
    expect(result?.needsReview).toBe(true);
    expect(result?.results).toEqual(['correct', 'manual']);
  });
});
