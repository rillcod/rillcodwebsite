import { describe, expect, it } from 'vitest';
import {
  deriveProgressReportResult,
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
});
