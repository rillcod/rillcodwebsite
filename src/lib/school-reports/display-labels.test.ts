import { describe, expect, it } from 'vitest';
import {
  formatClassDisplay,
  formatProgrammeCourseDisplay,
  formatProgrammeDisplay,
  REPORT_METRIC_LABELS,
} from './display-labels';

describe('display-labels', () => {
  it('normalises programme labels for display', () => {
    expect(formatProgrammeDisplay('teen dev')).toBe('Teen Developers');
    expect(formatProgrammeDisplay('TEEN DEVELOPERS')).toBe('Teen Developers');
  });

  it('title-cases class segments', () => {
    expect(formatClassDisplay('gabus high · teen developers · jss 1-3')).toBe(
      'Gabus High · Teen Developers · JSS 1-3',
    );
  });

  it('joins programme and course for chart labels', () => {
    expect(formatProgrammeCourseDisplay('teen dev', 'Python Programming')).toBe(
      'Teen Developers · Python Programming',
    );
  });

  it('exposes consistent mean-score labels for reports', () => {
    expect(REPORT_METRIC_LABELS.meanScore).toBe('Mean score');
    expect(REPORT_METRIC_LABELS.programmeCourseOutcomes).toBe('Programme and course outcomes');
  });
});
