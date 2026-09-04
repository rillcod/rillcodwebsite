import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('keeps download, email and audit linked to the exact safe revision', () => {
    const download = readFileSync(
      join(process.cwd(), 'src/app/api/school-performance-reports/[id]/pdf/route.ts'),
      'utf8',
    );
    const email = readFileSync(
      join(process.cwd(), 'src/app/api/school-performance-reports/[id]/email/route.ts'),
      'utf8',
    );
    expect(download).toContain("'X-Report-Pdf-Hash': pdfHash");
    expect(download).toContain("'X-Report-Content-Hash': contentHash");
    expect(download).toContain("'X-Report-Revision': String(revisionNumber)");
    expect(email).toContain('school-safe audience');
    expect(email).toContain("?revision=${revisionNumber}");
    expect(email).toContain('pdfHash,');
    expect(email).toContain('contentHash,');
  });
});
