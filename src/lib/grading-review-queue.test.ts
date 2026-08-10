import { describe, expect, it } from 'vitest';
import { buildGradingReviewQueue } from './grading-review-queue';

const rows = [
  { id: 'ai', status: 'submitted', submitted_at: '2026-08-03T10:00:00Z', ai_suggested_grade: 18 },
  { id: 'manual', status: 'submitted', submitted_at: '2026-08-02T10:00:00Z', ai_suggested_grade: null },
  { id: 'late', status: 'late', submitted_at: '2026-08-04T10:00:00Z', ai_suggested_grade: 15 },
];

describe('grading review queue', () => {
  it('puts late work and manual exceptions before routine AI-ready reviews', () => {
    expect(buildGradingReviewQueue(rows, 'priority').map((row) => row.id))
      .toEqual(['late', 'manual', 'ai']);
  });

  it('separates AI-ready work without changing the source queue', () => {
    expect(buildGradingReviewQueue(rows, 'ai_ready').map((row) => row.id)).toEqual(['late', 'ai']);
    expect(rows.map((row) => row.id)).toEqual(['ai', 'manual', 'late']);
  });

  it('keeps only submissions that need manual judgement', () => {
    expect(buildGradingReviewQueue(rows, 'manual').map((row) => row.id)).toEqual(['manual']);
  });
});
