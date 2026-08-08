import { describe, expect, it } from 'vitest';
import {
  ENGAGEMENT_BANDS,
  SCORE_WEIGHTS,
  computeFinalScore,
  computeWeightedScore,
  getEngagementBand,
  type ScoreComponents,
} from './grading';

const strongScores: ScoreComponents = {
  theory: 90,
  classwork: 80,
  practical: 85,
  assignments: 95,
  attendance: 90,
  assessment: 88,
};

describe('unified grading policy', () => {
  it('keeps the canonical component weights at exactly 100%', () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((total, weight) => total + weight, 0)).toBe(1);
  });

  it('does not alter an official score because engagement is low', () => {
    const weighted = computeWeightedScore(strongScores);
    const result = computeFinalScore(strongScores, 10);

    expect(result.raw).toBe(weighted);
    expect(result.capped).toBe(weighted);
    expect(result.grade.code).toBe('A1');
    expect(result.cap).toEqual(getEngagementBand(10));
  });

  it('accepts the centrally published weights without changing score handling', () => {
    const score = computeWeightedScore(strongScores, {
      theory: 0.3, classwork: 0.1, practical: 0.15,
      assignments: 0.2, attendance: 0.1, assessment: 0.15,
    });
    expect(score).toBe(89);
  });

  it('uses the published policy in the final result calculation', () => {
    const result = computeFinalScore(strongScores, 100, {
      theory: 1, classwork: 0, practical: 0,
      assignments: 0, attendance: 0, assessment: 0,
    });
    expect(result.raw).toBe(strongScores.theory);
  });

  it('uses engagement bands only as coaching signals', () => {
    expect(ENGAGEMENT_BANDS.every((band) => !('maxScore' in band))).toBe(true);
    expect(getEngagementBand(100).label).toBe('Active');
    expect(getEngagementBand(0).label).toBe('Inactive');
  });
});
