import { describe, expect, it } from 'vitest';
import { progressReportPublishIssues } from './publication';

const validReport = {
  student_id: 'student-1', student_name: 'Ada Student', section_class: 'JSS1A', course_name: 'Coding',
  report_term: 'First Term', report_period: '2026/2027', school_section: 'school', report_date: '2026-07-10',
  instructor_name: 'Teacher', theory_score: 70, practical_score: 70, attendance_score: 70,
  participation_score: 70, overall_score: 70, overall_grade: 'B2', key_strengths: 'Strong effort',
  areas_for_growth: 'More practice', engagement_metrics: { classwork_score: 70, assessment_score: 70 },
};

describe('progressReportPublishIssues', () => {
  it('accepts a complete school report', () => expect(progressReportPublishIssues(validReport)).toEqual([]));
  it('requires the academic period for school reports', () => expect(progressReportPublishIssues({ ...validReport, report_period: '' })).toContain('report_period is required for school reports before publishing'));
  it('rejects invalid component scores', () => expect(progressReportPublishIssues({ ...validReport, theory_score: 101 })).toContain('theory_score must be between 0 and 100 before publishing'));
  it('requires qualitative comments', () => expect(progressReportPublishIssues({ ...validReport, key_strengths: '' })).toContain('key_strengths is required before publishing'));
  it('blocks publishing when automated assignment evidence is missing', () => expect(progressReportPublishIssues({ ...validReport, engagement_metrics: { classwork_score: 70, assessment_score: 70, assignment_evidence_missing: true } })).toContain('assignment evidence is missing; review and enter the real assignment score before publishing'));
});