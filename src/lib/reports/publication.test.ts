import { describe, expect, it } from 'vitest';
import { progressReportPublishIssues, publishedProgressReportEditIssue } from './publication';

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
  it('requires Write review for compulsory school papers prepared through Auto-fill', () => expect(progressReportPublishIssues({
    ...validReport,
    engagement_metrics: { classwork_score: 70, assessment_score: 70, score_authority: 'host_school', host_review_required: true },
  })).toContain('school First Test, Second Test and Examination marks must be reviewed in Write before publishing'));
  it('requires all three official papers for a compulsory school report', () => expect(progressReportPublishIssues({
    ...validReport,
    engagement_metrics: {
      classwork_score: 70,
      assessment_score: 70,
      score_authority: 'host_school',
      programme_standing: 'compulsory',
      first_test_earned: 14,
      first_test_max: 20,
    },
  })).toContain('First Test, Second Test and Examination marks are all required for this compulsory school report'));
  it('blocks publishing when course_name conflicts with section_class programme', () => expect(progressReportPublishIssues({
    ...validReport,
    section_class: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
    course_name: 'Creative Coding with Scratch',
  })).toContain('course_name does not match the learner\'s class programme — choose the course that matches their class before publishing'));
});

describe('publishedProgressReportEditIssue', () => {
  it('allows normal draft editing', () => {
    expect(publishedProgressReportEditIssue({ is_published: false }, { theory_score: 80 })).toBeNull();
  });

  it('requires an explicit unpublish before academic changes', () => {
    expect(publishedProgressReportEditIssue(
      { is_published: true },
      { theory_score: 80 },
    )).toContain('Unpublish');
  });

  it('allows a clean unpublish transition but not unpublish-and-edit in one request', () => {
    expect(publishedProgressReportEditIssue({ is_published: true }, { is_published: false })).toBeNull();
    expect(publishedProgressReportEditIssue(
      { is_published: true },
      { is_published: false, theory_score: 80 },
    )).toContain('Unpublish');
  });

  it('allows finance notice maintenance without changing the academic record', () => {
    expect(publishedProgressReportEditIssue(
      { is_published: true },
      { show_payment_notice: true },
    )).toBeNull();
  });
});
