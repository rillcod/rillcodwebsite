import { describe, expect, it } from 'vitest';
import { createRecordsPdf } from './print-pdf';

describe('Records PDF', () => {
  it('paginates long records and preserves the supplied sorted selection', async () => {
    const rows = Array.from({ length: 85 }, (_, i) => [i + 1, `Student ${String(i + 1).padStart(3, '0')} Alexandra Long-Family-Name`, 'Student', 'example.parent@school.example', 'Example International School', 'Primary 2', 'Coding', 'School', 'Active', '08 Sep 2026']);
    const original = JSON.stringify(rows);
    const doc = await createRecordsPdf({ title: 'People records', sortLabel: 'Name (ascending)', columns: ['#', 'Name', 'Type', 'Email', 'School', 'Grade', 'Program', 'Source', 'Status', 'Registered'], rows });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(JSON.stringify(rows)).toBe(original);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
    if (process.env.PDF_VISUAL_QA) {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync('tmp/pdfs', { recursive: true });
      writeFileSync('tmp/pdfs/records-preview.pdf', Buffer.from(doc.output('arraybuffer')));
    }
  });
});
