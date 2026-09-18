import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SchoolReportTermNotice } from './SchoolReportTermNotice';

describe('school report term clarity', () => {
  it('separates St Peter’s older book from the current published learner results', () => {
    const html = renderToStaticMarkup(<SchoolReportTermNotice schoolId="school-1" schoolName="St Peter Catholic School" term="Third Term" year="2025/2026" now={new Date('2026-09-18T12:00:00Z')} />);
    expect(html).toContain('older term');
    expect(html).toContain('First Term');
    expect(html).toContain('2026/2027');
    expect(html).toContain('schoolId=school-1');
    expect(html).toContain('term=Third+Term');
    expect(html).toContain('year=2025%2F2026');
    expect(html).toContain('Publishing student results does not publish the school report book');
  });
  it('does not suggest replacing a current book', () => {
    const html = renderToStaticMarkup(<SchoolReportTermNotice schoolId="school-1" schoolName="School" term="First Term" year="2026/2027" now={new Date('2026-09-18T12:00:00Z')} />);
    expect(html).not.toContain('Open current-term setup');
    expect(html).toContain('View this term');
  });
});
