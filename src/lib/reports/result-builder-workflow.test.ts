import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const builder = readFileSync(join(ROOT, 'app/dashboard/reports/builder/page.tsx'), 'utf8');
const results = readFileSync(join(ROOT, 'app/dashboard/results/page.tsx'), 'utf8');
const flow = readFileSync(join(ROOT, 'components/reports/LearnerReportFlowStrip.tsx'), 'utf8');

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

  it('lets a returning teacher reopen the exact canonical record', () => {
    expect(builder).toContain('Continue recent work');
    expect(builder).toContain("reportId: report.id");
    expect(builder).toContain("report.is_published ? 'publish' : 'write'");
    expect(builder).toContain('Open draft');
    expect(results).toContain("params.set('report', r.id)");
    expect(results).toContain('Open another report for this student');
  });

  it('presents one report workflow with Auto-fill as an optional helper', () => {
    expect(flow).toContain("label: 'Write & edit'");
    expect(flow).toContain("label: 'Review & publish'");
    expect(flow).toContain('Optional');
    expect(flow).toContain("filter((step) => step.key !== 'prepare')");
  });

  it('keeps optional details out of the teacher primary path', () => {
    expect(builder).toContain('<details className="group overflow-hidden rounded-xl border border-border bg-card">');
    expect(builder).toContain('Payment notice');
    expect(builder).toContain('Optional · shown on every card');
    expect(builder).toContain('Compulsory school · school examination papers');
    expect(builder).toContain('Optional programme · Rillcod learning evidence');
    expect(builder).toContain('<span className="font-black text-foreground">Next: </span>');
    expect(builder).toContain('{selectedStudent ? <div id="pdf-print-target" aria-hidden="true"');
  });
});
