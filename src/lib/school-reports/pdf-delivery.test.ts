import { describe, expect, it } from 'vitest';
import { safeSchoolReportPdfFilename } from './pdf-delivery';

describe('safeSchoolReportPdfFilename', () => {
  it('slugifies report titles for attachment names', () => {
    expect(safeSchoolReportPdfFilename('Adunt Grace · First Term 2026')).toBe(
      'adunt-grace-first-term-2026.pdf',
    );
  });

  it('falls back when title is empty', () => {
    expect(safeSchoolReportPdfFilename('')).toBe('school-performance-report.pdf');
  });
});
