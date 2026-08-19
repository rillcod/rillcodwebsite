import { describe, expect, it } from 'vitest';
import {
  deriveProgressReportResult,
  hasRecordedProgressReportScores,
  isLockedLearnerResult,
  isUnsetScore,
  progressReportScoreComponents,
  touchesProgressReportScores,
} from './score';

describe('progress report score adapter', () => {
  it('maps legacy report columns into the canonical six components', () => {
    expect(progressReportScoreComponents({
      theory_score: 80,
      practical_score: 70,
      attendance_score: 60,
      participation_score: 90,
      engagement_metrics: { classwork_score: 50, assessment_score: 40 },
    })).toEqual({
      theory: 80,
      classwork: 50,
      practical: 70,
      assignments: 60,
      attendance: 90,
      assessment: 40,
    });
  });

  it('derives the official score and grade from the shared grading policy', () => {
    expect(deriveProgressReportResult({
      theory_score: 80,
      practical_score: 70,
      attendance_score: 60,
      participation_score: 90,
      engagement_metrics: { classwork_score: 50, assessment_score: 40 },
    })).toMatchObject({ overallScore: 66, overallGrade: 'B3' });
  });

  it('detects score-bearing updates without treating narrative edits as scores', () => {
    expect(touchesProgressReportScores({ theory_score: 70 })).toBe(true);
    expect(touchesProgressReportScores({ engagement_metrics: {} })).toBe(true);
    expect(touchesProgressReportScores({ key_strengths: 'Clear reasoning' })).toBe(false);
  });

  it('treats typed zero as a saved score, not a blank to auto-fill', () => {
    expect(isUnsetScore(null)).toBe(true);
    expect(isUnsetScore(undefined)).toBe(true);
    expect(isUnsetScore('')).toBe(true);
    expect(isUnsetScore(0)).toBe(false);
    expect(isUnsetScore('0')).toBe(false);
  });

  it('treats typed and published rows as locked, but not unpublished automatic drafts', () => {
    expect(hasRecordedProgressReportScores({ theory_score: 80 })).toBe(true);
    expect(hasRecordedProgressReportScores({ theory_score: 0, practical_score: 0 })).toBe(false);
    expect(isLockedLearnerResult({ is_published: true, calculation_mode: 'automatic', theory_score: 80 })).toBe(true);
    expect(isLockedLearnerResult({ is_published: false, calculation_mode: 'manual', theory_score: 80 })).toBe(true);
    expect(isLockedLearnerResult({ is_published: false, calculation_mode: 'automatic', theory_score: 80 })).toBe(false);
    expect(isLockedLearnerResult({ is_published: false, theory_score: 80 })).toBe(true);
  });
});
