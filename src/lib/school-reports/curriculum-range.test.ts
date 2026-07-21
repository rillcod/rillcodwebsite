import { describe, expect, it } from 'vitest';
import { suggestReportCurriculumRange } from './curriculum-range';

describe('suggestReportCurriculumRange', () => {
  it('defaults to term weeks when nothing is tracked', () => {
    const result = suggestReportCurriculumRange({
      academicTermNumber: 1,
      trackingRows: [],
      syllabusCount: 2,
    });
    expect(result.source).toBe('term_default');
    expect(result.curriculumStartTerm).toBe(1);
    expect(result.curriculumEndWeek).toBe(12);
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
    expect(result.curriculumStartWeek).toBe(3);
    expect(result.curriculumEndWeek).toBe(8);
    expect(result.trackedWeekCount).toBe(2);
  });
});
