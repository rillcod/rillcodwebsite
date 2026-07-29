import { describe, expect, it } from 'vitest';
import {
  formatClassDisplay,
  formatPersonDisplayName,
  formatProgrammeCourseDisplay,
  formatProgrammeDisplay,
  formatSchoolDisplayName,
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

  it('normalises people names without losing punctuation', () => {
    expect(formatPersonDisplayName('EDE VICTORY ANNABEL')).toBe('Ede Victory Annabel');
    expect(formatPersonDisplayName('Faithful ekhagousa')).toBe('Faithful Ekhagousa');
    expect(formatPersonDisplayName("mary-jane o'CONNOR")).toBe("Mary-Jane O'Connor");
    expect(formatPersonDisplayName('john McDONALD')).toBe('John McDonald');
    expect(formatPersonDisplayName('ifeoma o\u2019NEILL')).toBe('Ifeoma O\u2019Neill');
  });

  it('normalises school names while preserving known acronyms', () => {
    expect(formatSchoolDisplayName('GREENVILLE MONTESORRI SCHOOL')).toBe(
      'Greenville Montesorri School',
    );
    expect(formatSchoolDisplayName('RILLCOD STEM & ICT ACADEMY GRA')).toBe(
      'Rillcod STEM & ICT Academy GRA',
    );
  });
});
