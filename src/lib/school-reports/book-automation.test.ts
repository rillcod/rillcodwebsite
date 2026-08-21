import { describe, expect, it } from 'vitest';
import { automaticSchoolReportTitle } from './book-automation';

describe('automaticSchoolReportTitle', () => {
  it('creates one human term-book title from the canonical academic term', () => {
    expect(
      automaticSchoolReportTitle('Abundant Grace School', {
        term_label: 'First Term',
        academic_year: '2026/2027',
      }),
    ).toBe('Abundant Grace School · First Term 2026/2027 Delivery Book');
  });

  it('keeps generated titles within the database and form limit', () => {
    const title = automaticSchoolReportTitle('A'.repeat(220), {
      term_label: 'Third Term',
      academic_year: '2026/2027',
    });
    expect(title.length).toBeLessThanOrEqual(180);
  });
});
