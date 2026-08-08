import { describe, expect, it } from 'vitest';
import { hasCbtAttemptEvidence, hasProtectedAssignmentScoreEvidence } from './record-retention';

describe('academic record retention', () => {
  it('protects every persisted assignment grading signal', () => {
    expect(hasProtectedAssignmentScoreEvidence({ grade: 0 })).toBe(true);
    expect(hasProtectedAssignmentScoreEvidence({ weighted_score: 0 })).toBe(true);
    expect(hasProtectedAssignmentScoreEvidence({ graded_at: '2026-08-08T00:00:00Z' })).toBe(true);
    expect(hasProtectedAssignmentScoreEvidence({ graded_by: 'teacher-1' })).toBe(true);
    expect(hasProtectedAssignmentScoreEvidence({ status: 'graded' })).toBe(true);
    expect(hasProtectedAssignmentScoreEvidence({ grading_mode: 'manual' })).toBe(true);
  });

  it('allows only an ungraded submission draft to remain removable', () => {
    expect(hasProtectedAssignmentScoreEvidence({ status: 'submitted', grade: null, weighted_score: null })).toBe(false);
  });

  it('treats any CBT session as learner evidence', () => {
    expect(hasCbtAttemptEvidence({ id: 'session-1' })).toBe(true);
    expect(hasCbtAttemptEvidence({ score: 0 })).toBe(true);
    expect(hasCbtAttemptEvidence(null)).toBe(false);
  });
});
