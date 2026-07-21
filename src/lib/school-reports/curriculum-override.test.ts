import { describe, expect, it } from 'vitest';
import {
  curriculumRangeDiffersFromSuggestion,
  needsCurriculumOverrideReason,
  validateCurriculumOverrideReason,
} from './curriculum-override';
import type { SuggestedCurriculumRange } from './curriculum-range';

const suggestion: SuggestedCurriculumRange = {
  curriculumStartTerm: 1,
  curriculumStartWeek: 1,
  curriculumEndTerm: 1,
  curriculumEndWeek: 12,
  source: 'delivery_tracking',
  trackedWeekCount: 8,
  syllabusCount: 12,
  status: 'detected',
  hint: 'Detected from delivery tracking',
  checkedAt: new Date().toISOString(),
  sourceChecked: 'curriculum_week_tracking',
  schoolCourses: [],
};

describe('curriculum override helpers', () => {
  it('detects when manual range differs from suggestion', () => {
    expect(
      curriculumRangeDiffersFromSuggestion(
        {
          curriculumStartTerm: 1,
          curriculumStartWeek: 2,
          curriculumEndTerm: 1,
          curriculumEndWeek: 12,
        },
        suggestion,
      ),
    ).toBe(true);
  });

  it('requires override reason when curriculum query failed', () => {
    expect(
      needsCurriculumOverrideReason(
        {
          curriculumStartTerm: 1,
          curriculumStartWeek: 1,
          curriculumEndTerm: 1,
          curriculumEndWeek: 12,
        },
        { ...suggestion, status: 'query_failed' },
      ),
    ).toBe(true);
  });

  it('validates minimum override reason length', () => {
    expect(
      validateCurriculumOverrideReason(
        {
          curriculumStartTerm: 2,
          curriculumStartWeek: 1,
          curriculumEndTerm: 2,
          curriculumEndWeek: 8,
          curriculumOverrideReason: 'short',
        },
        suggestion,
      ),
    ).toMatch(/at least 8 characters/i);
  });

  it('accepts valid override when range differs', () => {
    expect(
      validateCurriculumOverrideReason(
        {
          curriculumStartTerm: 2,
          curriculumStartWeek: 1,
          curriculumEndTerm: 2,
          curriculumEndWeek: 8,
          curriculumOverrideReason: 'School started Teen Dev mid-term.',
        },
        suggestion,
      ),
    ).toBeNull();
  });
});
