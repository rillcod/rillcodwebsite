import { describe, expect, it } from 'vitest';
import {
  academicPeriodWeekCount,
  curriculumEndWeekForTerm,
  suggestReportCurriculumRange,
} from './curriculum-range';

describe('suggestReportCurriculumRange', () => {
  it('uses the supplied dynamic syllabus window when nothing is tracked', () => {
    const result = suggestReportCurriculumRange({
      academicTermNumber: 1,
      trackingRows: [],
      syllabusCount: 2,
      defaultEndWeek: 10,
    });
    expect(result.source).toBe('term_default');
    expect(result.status).toBe('no_tracking');
    expect(result.curriculumStartTerm).toBe(1);
    expect(result.curriculumEndWeek).toBe(10);
    expect(result.correctiveAction).toMatch(/Mark delivery weeks/i);
  });

  it('derives independent curriculum lengths without assuming twelve weeks', () => {
    expect(curriculumEndWeekForTerm([
      { content: { terms: [{ term: 3, weeks: Array.from({ length: 8 }, (_, index) => ({ week: index + 1 })) }] } },
      { content: { terms: [{ term_number: 3, weeks: Array.from({ length: 14 }, (_, index) => ({ week_number: index + 1 })) }] } },
    ], 3)).toBe(14);
    expect(curriculumEndWeekForTerm([
      { content: { terms: [{ term: 3, weeks: Array.from({ length: 10 }, (_, index) => ({ week: index + 1 })) }] } },
    ], 3)).toBe(10);
  });

  it('derives the fallback from academic dates', () => {
    expect(academicPeriodWeekCount('2026-04-30', '2026-08-05')).toBe(14);
  });

  it('marks empty syllabi as no_curriculum', () => {
    const result = suggestReportCurriculumRange({
      academicTermNumber: 1,
      trackingRows: [],
      syllabusCount: 0,
    });
    expect(result.status).toBe('no_curriculum');
  });

  it('uses min/max marked weeks for the academic term', () => {
    const result = suggestReportCurriculumRange({
      academicTermNumber: 2,
      trackingRows: [
        { term_number: 2, week_number: 3, status: 'completed' },
        { term_number: 2, week_number: 8, status: 'in_progress' },
        { term_number: 1, week_number: 10, status: 'completed' },
      ],
      syllabusCount: 3,
    });
    expect(result.source).toBe('delivery_tracking');
    expect(result.status).toBe('detected');
    expect(result.curriculumStartWeek).toBe(3);
    expect(result.curriculumEndWeek).toBe(8);
    expect(result.trackedWeekCount).toBe(2);
  });
});
