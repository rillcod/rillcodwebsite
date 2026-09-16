/** Render the actual roster exporter with synthetic students; no account or network access. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildStudentRosterRows, downloadStudentRosterPdf } from '../src/lib/cards/exportRoster';

async function main() {
  mkdirSync('tmp/pdfs', { recursive: true });
  const rows = buildStudentRosterRows(Array.from({ length: 65 }, (_, i) => ({
    id: `proof-student-${i}`, name: `Sample Student ${String(65 - i).padStart(2, '0')}`,
    gradeLevel: i < 40 ? 'JSS 1' : 'JSS 2', sectionClass: i % 2 ? 'B' : 'A',
  })));
  await downloadStudentRosterPdf(rows, {
    title: 'Sample school class lists', mode: 'save', filename: resolve('tmp/pdfs/card-roster-proof.pdf'),
  });
}
void main();
