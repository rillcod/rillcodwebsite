import { describe, expect, it } from 'vitest';
import { buildDeliveredTopicsSummary, buildDeliveryContext, buildReportTopicsPresentation, buildTopicsCoveredDraft } from './delivered-topics';

describe('buildDeliveredTopicsSummary', () => {
  it('prefers learner evidence when curriculum weeks are empty', () => {
    const summary = buildDeliveredTopicsSummary({
      period: { termLabel: 'First Term', academicYear: '2026/2027' } as any,
      summary: { curriculumCoverage: 8 } as any,
      curriculum: { plannedWeeks: 12, completedWeeks: 1, inProgressWeeks: 0, skippedWeeks: 0, courses: [] },
      programmeCoursePerformance: [
        { programme: 'Coding', course: 'Scratch Games', students: 24, submissions: 18, averageScore: 71 },
        { programme: 'Robotics', course: 'Intro Bots', students: 24, submissions: 6, averageScore: 65 },
      ],
    });

    expect(summary.topics).toHaveLength(2);
    expect(summary.topics[0].source).toBe('learner_evidence');
    expect(summary.summaryLines.some((line) => line.includes('Scratch Games'))).toBe(true);
    expect(summary.proseSeed).toContain('Partner schools pace STEM progressively');
  });

  it('merges curriculum weeks with learner evidence for the same course', () => {
    const summary = buildDeliveredTopicsSummary({
      period: { termLabel: 'First Term' } as any,
      summary: { curriculumCoverage: 25 } as any,
      curriculum: {
        plannedWeeks: 12,
        completedWeeks: 3,
        inProgressWeeks: 1,
        skippedWeeks: 0,
        courses: [
          { programme: 'Coding', course: 'Scratch Games', planned: 12, completed: 3, inProgress: 1, skipped: 0, coverage: 25 },
        ],
      },
      programmeCoursePerformance: [
        { programme: 'Coding', course: 'Scratch Games', students: 20, submissions: 10, averageScore: 68 },
      ],
    });

    expect(summary.topics[0].source).toBe('both');
    expect(summary.topics[0].weeksCompleted).toBe(3);
    expect(summary.topics[0].learners).toBe(20);
  });

  it('merges generic manual-entry programme labels with curriculum programme names', () => {
    const summary = buildDeliveredTopicsSummary({
      period: { termLabel: 'First Term' } as any,
      summary: { curriculumCoverage: 20 } as any,
      curriculum: {
        plannedWeeks: 12,
        completedWeeks: 2,
        inProgressWeeks: 0,
        skippedWeeks: 0,
        courses: [
          { programme: 'Coding', course: 'Scratch Games', planned: 12, completed: 2, inProgress: 0, skipped: 0, coverage: 17 },
          { programme: 'Robotics', course: 'Intro Bots', planned: 12, completed: 0, inProgress: 0, skipped: 0, coverage: 0 },
        ],
      },
      programmeCoursePerformance: [
        { programme: 'School programmes', course: 'Scratch Games', students: 20, submissions: 10, averageScore: 68 },
        { programme: 'Robotics', course: 'Intro Bots', students: 18, submissions: 8, averageScore: 62 },
      ],
    });

    expect(summary.topics).toHaveLength(2);
    expect(summary.topics.some((topic) => topic.programme === 'Coding' && topic.course === 'Scratch Games')).toBe(true);
    expect(summary.topics.some((topic) => topic.course === 'Intro Bots')).toBe(true);
  });

  it('merges published-report courses when declaration only covers one course', () => {
    const summary = buildDeliveredTopicsSummary({
      period: { termLabel: 'Second Term', academicTermNumber: 1 } as any,
      summary: { curriculumCoverage: 0 } as any,
      curriculum: { plannedWeeks: 8, completedWeeks: 0, inProgressWeeks: 0, skippedWeeks: 0, courses: [] },
      deliveryDeclaration: {
        reportingWeeks: 8,
        selectedTopicKeys: ['a::1::1'],
        selectedTopics: [
          {
            key: 'a::1::1',
            programme: 'Young Innovators',
            course: 'Scratch',
            topic: 'Scratch — Animation',
            weekNumber: 1,
          },
        ],
        spannedWeeks: [],
        nextTermCheckpoint: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      programmeCoursePerformance: [
        { programme: 'Young Innovators', course: 'Scratch', students: 18, enrolledStudents: 18, submissions: 4, averageScore: 72 },
        { programme: 'Teen Developers', course: 'Python Programming', students: 12, enrolledStudents: 12, submissions: 6, averageScore: 68 },
      ],
      schoolProgrammes: [
        { programme: 'Young Innovators', course: 'Scratch', enrolledStudents: 18 },
        { programme: 'Teen Developers', course: 'Python Programming', enrolledStudents: 12 },
      ],
    });

    expect(summary.topics).toHaveLength(2);
    expect(summary.topics.map((row) => row.course)).toEqual(
      expect.arrayContaining(['Scratch', 'Python Programming']),
    );
    expect(summary.summaryLines.some((line) => line.includes('Python Programming'))).toBe(true);
  });
});

describe('buildDeliveryContext', () => {
  it('groups programme and course ranges for UI and AI', () => {
    const ctx = buildDeliveryContext({
      school: { name: 'Test School' } as any,
      period: { termLabel: 'First Term' } as any,
      summary: { curriculumCoverage: 17, activeStudents: 24, studentsWithScores: 20 } as any,
      curriculum: {
        plannedWeeks: 12,
        completedWeeks: 2,
        inProgressWeeks: 0,
        skippedWeeks: 0,
        courses: [
          { programme: 'Coding', course: 'Scratch Games', planned: 12, completed: 2, inProgress: 0, skipped: 0, coverage: 17 },
        ],
      },
      programmeCoursePerformance: [
        { programme: 'Coding', course: 'Scratch Games', students: 24, submissions: 18, averageScore: 71 },
      ],
    });

    expect(ctx.topicCount).toBe(1);
    expect(ctx.programmes[0].programme).toBe('Coding');
    expect(ctx.programmes[0].courses[0].weekRangeLabel).toContain('Weeks 1–2');
    expect(ctx.programmes[0].courses[0].weekRangeLabel).not.toMatch(/of \d+|curriculum map|No week range/i);
    expect(ctx.aiBrief.programmeDelivery[0].courses[0].weekRange).toContain('Weeks 1–2');
    expect(ctx.draftParagraph).toContain('Scratch Games');
  });
});

describe('buildReportTopicsPresentation', () => {
  it('shows both ticked and published-report courses in the preview', () => {
    const presentation = buildReportTopicsPresentation({
      school: { name: 'Abundant Grace' } as any,
      period: { termLabel: 'Second Term', academicTermNumber: 1 } as any,
      summary: { curriculumCoverage: 0 } as any,
      curriculum: { plannedWeeks: 8, completedWeeks: 0, inProgressWeeks: 0, skippedWeeks: 0, courses: [] },
      deliveryDeclaration: {
        reportingWeeks: 8,
        selectedTopicKeys: ['a::1::1'],
        selectedTopics: [
          {
            key: 'a::1::1',
            programme: 'Young Innovators',
            course: 'Scratch',
            topic: 'Scratch — Animation',
            weekNumber: 1,
          },
        ],
        spannedWeeks: [],
        nextTermCheckpoint: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      programmeCoursePerformance: [
        { programme: 'Young Innovators', course: 'Scratch', students: 18, enrolledStudents: 18, submissions: 4, averageScore: 72 },
        { programme: 'Teen Developers', course: 'Python Programming', students: 12, enrolledStudents: 12, submissions: 6, averageScore: 68 },
      ],
      schoolProgrammes: [
        { programme: 'Young Innovators', course: 'Scratch', enrolledStudents: 18 },
        { programme: 'Teen Developers', course: 'Python Programming', enrolledStudents: 12 },
      ],
    });

    expect(presentation?.sections).toHaveLength(2);
    expect(presentation?.plainText).toContain('Scratch');
    expect(presentation?.plainText).toContain('Python Programming');
  });
});

describe('buildTopicsCoveredDraft', () => {
  it('writes an explicit partial-path paragraph for one topic', () => {
    const draft = buildTopicsCoveredDraft({
      school: { name: 'Greenfield Academy' } as any,
      period: { termLabel: 'Second Term' } as any,
      summary: { curriculumCoverage: 15 } as any,
      curriculum: {
        plannedWeeks: 12,
        completedWeeks: 2,
        inProgressWeeks: 0,
        skippedWeeks: 0,
        courses: [
          { programme: 'AI', course: 'Prompt Basics', planned: 12, completed: 2, inProgress: 0, skipped: 0, coverage: 17 },
        ],
      },
      programmeCoursePerformance: [],
    });

    expect(draft).toContain('Greenfield Academy');
    expect(draft).toContain('Prompt Basics');
    expect(draft).toContain('progressive');
  });

  it('includes every enrolled programme course even when only one has assessment rows', () => {
    const summary = buildDeliveredTopicsSummary({
      school: { name: 'Abundant Grace' } as any,
      period: { termLabel: 'Second Term' } as any,
      summary: { curriculumCoverage: 0 } as any,
      curriculum: { plannedWeeks: 8, completedWeeks: 0, inProgressWeeks: 0, skippedWeeks: 0, courses: [] },
      programmeCoursePerformance: [
        { programme: 'Young Innovators', course: 'Scratch', students: 18, enrolledStudents: 18, submissions: 4, averageScore: 72 },
      ],
      schoolProgrammes: [
        { programme: 'Young Innovators', course: 'Scratch', enrolledStudents: 18 },
        { programme: 'Teen Developers', course: 'Python Programming', enrolledStudents: 12 },
      ],
    });

    expect(summary.topics).toHaveLength(2);
    expect(summary.topics.map((row) => row.course)).toEqual(
      expect.arrayContaining(['Scratch', 'Python Programming']),
    );
  });
});
