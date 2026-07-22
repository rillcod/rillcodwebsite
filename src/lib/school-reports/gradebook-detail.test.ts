import { describe, expect, it } from 'vitest';
import {
  buildGradebookDataSheet,
  buildLearnerGradebookDetail,
  formatAssignmentScoresForPdf,
  formatSubmissionRawLabel,
  submissionPercent,
} from './gradebook-detail';

describe('gradebook detail', () => {
  it('formats points-based assignment raw scores', () => {
    expect(
      formatSubmissionRawLabel({
        grade: 16,
        assignments: { title: 'Variables quiz', max_points: 20 },
      }),
    ).toBe('16/20');
    expect(
      submissionPercent({
        grade: 16,
        assignments: { max_points: 20 },
      }),
    ).toBe(80);
  });

  it('prefers published progress report components over class gradebook averages', () => {
    const detail = buildLearnerGradebookDetail(
      [
        {
          theory_score: 72,
          practical_score: 80,
          overall_score: 76,
          attendance_score: 88,
          participation_score: 91,
          engagement_metrics: { classwork_score: 84, assessment_score: 79 },
          is_published: true,
          course_name: 'Python',
        },
      ],
      [
        {
          grade: 18,
          submitted_at: '2026-01-10T00:00:00.000Z',
          assignments: { title: 'Loops', max_points: 20 },
        },
      ],
    );

    expect(detail.theoryScore).toBe(72);
    expect(detail.examScore).toBe(76);
    expect(detail.classworkScore).toBe(84);
    expect(detail.assessmentScore).toBe(79);
    expect(detail.assignmentAverage).toBe(88);
    expect(detail.fromPublishedReport).toBe(true);
    expect(detail.assignments[0]?.title).toContain('Classwork');
    expect(formatAssignmentScoresForPdf(detail.assignments)).toContain('Classwork');
    expect(formatAssignmentScoresForPdf(detail.assignments)).toContain('Loops: 18/20');
  });

  it('builds flat summary and detail rows for datasheet appendices', () => {
    const detail = buildLearnerGradebookDetail(
      [
        {
          attendance_score: 88,
          engagement_metrics: { classwork_score: 84, assessment_score: 79 },
          course_name: 'Python',
        },
      ],
      [
        {
          grade: 18,
          submitted_at: '2026-01-10T00:00:00.000Z',
          assignments: { title: 'Loops', max_points: 20 },
        },
      ],
    );
    const sheet = buildGradebookDataSheet([
      { id: 's1', name: 'Ada Lovelace', gradebook: detail },
    ]);

    expect(sheet.summary).toEqual([
      {
        learnerId: 's1',
        learnerName: 'Ada Lovelace',
        classworkScore: 84,
        assignmentAverage: 88,
        assessmentScore: 79,
      },
    ]);
    expect(sheet.detail).toHaveLength(4);
    expect(sheet.detail.map((row) => row.component)).toEqual(
      expect.arrayContaining(['Classwork', 'Assignments', 'Assessment', 'Loops']),
    );
  });
});
