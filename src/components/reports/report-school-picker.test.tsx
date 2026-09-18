import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { filterReportSchools, ReportSchoolPicker } from './ReportSchoolPicker';

const schools = [{ id: 'b', name: 'Regila School' }, { id: 'a', name: 'Alpha School' }, { id: 'c', name: 'Regila School' }];
describe('school selection and daily report work', () => {
  it('searches by words without case sensitivity and sorts names', () => {
    expect(filterReportSchools(schools, ' SCHOOL reg ')).toHaveLength(2);
    expect(filterReportSchools(schools, '')[0].id).toBe('a');
    expect(filterReportSchools(schools, 'missing')).toEqual([]);
  });
  it('identifies same-name schools by ID and keeps full names visible', () => {
    const html = renderToStaticMarkup(<ReportSchoolPicker schools={schools} value="c" onChange={() => {}} />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('Find a school');
    expect(html).toContain('min-h-11');
  });
  it('explains an empty permitted school list', () => {
    expect(renderToStaticMarkup(<ReportSchoolPicker schools={[]} onChange={() => {}} />)).toContain('No schools available for your account.');
  });
  it('keeps identity changes in setup and stops keyboard navigation after a failed save', () => {
    const page = readFileSync('src/app/dashboard/reports/builder/page.tsx', 'utf8');
    expect(page).not.toContain('value={sessionConfig.school_name}');
    expect(page).toContain('school_name: school.name, school_id: school.id');
    expect(page).toContain('Change school or class');
    const keyboard = page.slice(page.indexOf('// ── Keyboard navigation:'), page.indexOf('// ── Persist session config'));
    expect(keyboard.match(/if \(isDirty && !\(await handleSave\(false\)\)\) return;/g)).toHaveLength(2);
    expect(keyboard).toContain('keyboardNavigationBusy.current');
    expect(page).toContain('Find an older report');
  });
});
