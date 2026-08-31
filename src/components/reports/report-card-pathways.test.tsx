import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReportCard from './ReportCard';
import ModernReportCard from './ModernReportCard';
import PrintableReport from './PrintableReport';

const baseReport = {
  id: 'report-1',
  verification_code: 'RPT-DEMO',
  student_name: 'Ada Student',
  school_name: 'Demo School',
  course_name: 'Coding and STEM',
  section_class: 'JSS 1',
  student_grade: 'JSS 1',
  report_term: 'First Term',
  report_period: '2026/2027',
  report_date: '2026-12-10',
  instructor_name: 'Teacher One',
  theory_score: 83,
  practical_score: 76,
  attendance_score: 81,
  participation_score: 92,
  overall_score: 80,
  overall_grade: 'A1',
  key_strengths: 'Consistent problem solving and thoughtful project work.',
  areas_for_growth: 'Continue practising written explanations.',
  engagement_metrics: {
    classwork_score: 78,
    assessment_score: 80,
    score_authority: 'host_school',
    programme_standing: 'compulsory',
    first_test_earned: 14,
    first_test_max: 20,
    second_test_earned: 16,
    second_test_max: 20,
    examination_earned: 50,
    examination_max: 60,
    host_total_earned: 80,
    host_total_max: 100,
    host_total_percent: 80,
  },
};

const templates = [
  ['standard', (report: any) => React.createElement(ReportCard, { report, orgSettings: null })],
  ['modern', (report: any) => React.createElement(ModernReportCard, { report: { ...report, template_id: 'executive' }, orgSettings: null })],
  ['printable', (report: any) => React.createElement(PrintableReport, { report, orgSettings: null })],
] as const;

describe('progress report pathway rendering used by PDF capture', () => {
  for (const [name, render] of templates) {
    it(`${name} keeps official school papers separate from Rillcod learning evidence`, () => {
      const html = renderToStaticMarkup(render(baseReport));

      expect(html).toContain('Rillcod Progress Report');
      expect(html).toContain('First Test');
      expect(html).toContain('14/20');
      expect(html).toContain('Second Test');
      expect(html).toContain('16/20');
      expect(html).toContain('Examination');
      expect(html).toContain('50/60');
      expect(html).toContain('80/100');
      expect(html).toContain('School paper total');
      expect(html).toContain('Learning we taught');
      expect(html).toContain('Assignments');
      expect(html).toContain('Practical / Projects');
      expect(html).toContain('Classwork');
      expect(html).toContain('Attendance');
    });

    it(`${name} names missing school papers without assigning a failing grade`, () => {
      const html = renderToStaticMarkup(render({
        ...baseReport,
        engagement_metrics: {
          score_authority: 'host_school',
          programme_standing: 'compulsory',
          first_test_earned: 14,
          first_test_max: 20,
        },
      }));

      expect(html).toContain('First Test');
      expect(html).toContain('Second Test');
      expect(html).toContain('Examination');
      expect(html).toContain('Awaiting all papers');
      expect(html).not.toContain('>F9</h3>');
    });
  }

  it('keeps the Rillcod evidence pathway on the normal weighted report layout', () => {
    const rillcodReport = {
      ...baseReport,
      engagement_metrics: {
        classwork_score: 78,
        assessment_score: 80,
        score_authority: 'rillcod',
        programme_standing: 'optional',
      },
    };
    const html = renderToStaticMarkup(React.createElement(ReportCard, { report: rillcodReport, orgSettings: null }));

    expect(html).toContain('Progress Report');
    expect(html).toContain('Theory / Written');
    expect(html).toContain('Mid-term Assessment');
    expect(html).not.toContain('14/20');
    expect(html).not.toContain('First Test + Second Test + Examination');
  });
});
