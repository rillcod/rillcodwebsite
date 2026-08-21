import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const builder = readFileSync(join(ROOT, 'app/dashboard/reports/builder/page.tsx'), 'utf8');

describe('result builder operational workflow', () => {
  it('advertises and implements grade-aware student search', () => {
    expect(builder).toContain('Search student by name, email or grade…');
    expect(builder).toContain("String((s as any).grade_level || (s as any).grade || '')");
    expect(builder).toContain("String(s.grade_level || s.grade || '')");
    expect(builder).toContain('Grade not assigned');
  });

  it('shows the selected learner grade in the compact mobile selector', () => {
    expect(builder).toContain('selectedGrade ? ` · ${selectedGrade}`');
    expect(builder).toContain("'Search name or grade…'");
  });

  it('saves dirty work before returning to the owning workflow', () => {
    expect(builder).toContain('const returnToRoster = async () =>');
    expect(builder).toContain('const saved = await handleSave(false)');
    expect(builder).toContain('router.push(returnToPrepareHref)');
    expect(builder).toContain('router.push(returnToResultsHref)');
  });

  it('surfaces browser-position and academic-period failures', () => {
    expect(builder).toContain('Server-saved report drafts are unchanged.');
    expect(builder).toContain('Re-select the reporting period before saving.');
    expect(builder).toContain('Dismiss report writer error');
    expect(builder).not.toMatch(/catch\s*\{\s*\/\*\s*ignore\s*\*\/\s*\}/);
  });
});
