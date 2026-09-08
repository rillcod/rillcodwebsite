import { describe, expect, it } from 'vitest';
import { buildStudentRosterRows, buildRosterSectionGroups, downloadStudentRosterPdf } from './exportRoster';

describe('RC roster print ordering', () => {
  it('uses natural section ordering instead of placing 10 before 2', () => {
    const rows = buildStudentRosterRows([
      { id: '11111111-1111-4111-8111-111111111111', name: 'Zoe', gradeLevel: 'Primary 2', sectionClass: 'Section 10' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Ada', gradeLevel: 'Primary 2', sectionClass: 'Section 2' },
    ]);
    expect(buildRosterSectionGroups(rows).map(g => g.sectionName)).toEqual(['Section 2', 'Section 10']);
  });
  it.skipIf(!process.env.PDF_VISUAL_QA)('can generate a complete multi-class PDF with long names', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync('tmp/pdfs', { recursive: true });
    const rows = buildStudentRosterRows(Array.from({ length: 95 }, (_, i) => ({
      id: `${String(i + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      name: `Student ${String(i + 1).padStart(3, '0')} Alexandra Chiamaka Long-Family-Name`,
      gradeLevel: i < 48 ? 'Primary 2' : 'Primary 3', sectionClass: 'Section 2',
    })));
    expect(await downloadStudentRosterPdf(rows, { title: 'RC roster', filename: 'tmp/pdfs/roster-preview.pdf', orgName: 'Rillcod Technologies', mode: 'save' })).toBe(true);
  });
});
