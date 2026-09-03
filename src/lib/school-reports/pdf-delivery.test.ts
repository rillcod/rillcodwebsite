import { describe, expect, it } from 'vitest';
import { hashRenderedPdf, safeSchoolReportPdfFilename } from './pdf-delivery';

describe('safeSchoolReportPdfFilename', () => {
  it('slugifies report titles for attachment names', () => {
    expect(safeSchoolReportPdfFilename('Adunt Grace · First Term 2026')).toBe(
      'adunt-grace-first-term-2026.pdf',
    );
  });

  it('falls back when title is empty', () => {
    expect(safeSchoolReportPdfFilename('')).toBe('school-performance-report.pdf');
  });

  it('fingerprints the exact rendered PDF bytes', () => {
    const first = hashRenderedPdf(Buffer.from('%PDF-1.7\nfirst'));
    const same = hashRenderedPdf(Buffer.from('%PDF-1.7\nfirst'));
    const changed = hashRenderedPdf(Buffer.from('%PDF-1.7\nsecond'));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(same);
    expect(first).not.toBe(changed);
  });
});
