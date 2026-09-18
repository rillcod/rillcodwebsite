import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportAppearanceControls } from './ReportAppearanceControls';

describe('report review controls', () => {
  it.each(['standard', 'modern', 'printable'] as const)('keeps %s layout available with clear labels', template => {
    const html = renderToStaticMarkup(<ReportAppearanceControls template={template} style="executive" onTemplateChange={() => {}} onStyleChange={() => {}} />);
    expect(html).toContain('Report appearance');
    expect(html).toContain('Print-friendly');
    expect(html).toContain(`value="${template}" selected=""`);
    expect(html.includes('Gold')).toBe(template === 'modern');
    expect(html).not.toContain('<details open');
  });
  it('keeps grade above actions and does not trap mobile actions in a hidden sideways row', () => {
    const page = readFileSync('src/app/dashboard/results/page.tsx', 'utf8');
    expect(page.indexOf('<PublishedResultSummary')).toBeLessThan(page.indexOf('aria-label="Report actions"'));
    expect(page).toContain('!loadingReport && reportToDisplay && <PublishedResultSummary');
    expect(page).toContain('Show payment notice');
    expect(page).toContain('Email history');
    expect(page).not.toContain('flex flex-nowrap items-center gap-1 overflow-x-auto pb-0.5');
    expect(page).toContain('isEditor && (selectedStudent || selectedReport)');
  });
  it('places the saved grade beside each student name and exposes failed lookups', () => {
    const page = readFileSync('src/app/dashboard/results/page.tsx', 'utf8');
    const list = page.slice(page.indexOf('{/* Student list */}'), page.indexOf('{/* ══ Report panel ══ */}'));
    expect(list).toContain('aria-label={`Grade ${r.overall_grade}`}');
    expect(list).toContain("unloadedGradeIds.has(s.id) ? 'Grade unavailable' : 'No report'");
    expect(list).toContain('Retry grades');
    expect(list).not.toContain("r.overall_grade ?? '?'");
    expect(page).toContain("{ data: [], error: { message: 'Grades could not be loaded' } }");
    expect(page).toContain('chunk.forEach(id => failedGradeIds.add(id))');
  });
});
