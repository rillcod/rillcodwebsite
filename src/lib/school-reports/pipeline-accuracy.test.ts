import { describe, expect, it } from 'vitest';
import {
  buildDeliveredTopicsSummary,
  buildReportTopicsPresentation,
} from './delivered-topics';
import { reconcileSchoolReportEnrolments } from './enrolment-counts';
import {
  programmeCourseKey,
  resolveProgrammeForCourseEvidence,
  supplementProgrammeScopeFromEvidence,
} from './school-curriculum-scope';

/** Abundant Grace shape: two classes, two courses, published reports on both, delivery ticks on Scratch only. */
const abundantGraceScopeBase = [
  {
    programme: 'Young Innovators',
    course: 'Scratch',
    courseId: 'scratch-id',
    programmeId: 'yi-id',
    enrolledStudents: 18,
    classIds: ['cls-scratch'],
    classNames: ['Abundant Grace · JSS1 Scratch'],
  },
  {
    programme: 'Teen Developers',
    course: 'Python Programming',
    courseId: 'python-id',
    programmeId: 'td-id',
    enrolledStudents: 12,
    classIds: ['cls-python'],
    classNames: ['Abundant Grace · JSS2 Python'],
  },
];

const scratchLearnerIds = Array.from({ length: 18 }, (_, index) => `scratch-${index + 1}`);
const pythonLearnerIds = Array.from({ length: 12 }, (_, index) => `python-${index + 1}`);

const publishedReports = [
  ...scratchLearnerIds.map((studentId, index) => ({
    studentId,
    courseName: 'Scratch',
    overallScore: 70 + (index % 5),
    participationScore: 65 + (index % 10),
  })),
  ...pythonLearnerIds.map((studentId, index) => ({
    studentId,
    courseName: 'Python Programming',
    overallScore: 68 + (index % 4),
    participationScore: 72 + (index % 8),
  })),
];

function buildCourseGroupsFromPublishedReports(
  scope: typeof abundantGraceScopeBase,
  reports: typeof publishedReports,
) {
  const groups = new Map<string, { programme: string; course: string; scores: number[]; students: Set<string> }>();
  for (const row of reports) {
    const programme = resolveProgrammeForCourseEvidence(scope, row.courseName);
    const key = programmeCourseKey(programme, row.courseName);
    const group = groups.get(key) ?? { programme, course: row.courseName, scores: [], students: new Set<string>() };
    group.scores.push(row.overallScore);
    group.students.add(row.studentId);
    groups.set(key, group);
  }
  for (const scopeRow of scope) {
    const key = programmeCourseKey(scopeRow.programme, scopeRow.course);
    if (!groups.has(key)) {
      groups.set(key, {
        programme: scopeRow.programme,
        course: scopeRow.course,
        scores: [],
        students: new Set<string>(),
      });
    }
  }
  const enrollmentByKey = new Map(
    scope.map((row) => [programmeCourseKey(row.programme, row.course), row.enrolledStudents]),
  );
  return Array.from(groups.values()).map((group) => ({
    programme: group.programme,
    course: group.course,
    submissions: group.scores.length,
    averageScore: group.scores.length
      ? Math.round(group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length)
      : 0,
    students: group.students.size,
    enrolledStudents: enrollmentByKey.get(programmeCourseKey(group.programme, group.course)) || 0,
  }));
}

describe('school report pipeline accuracy (Abundant Grace fixture)', () => {
  it('keeps both courses in scope when published reports exist for each', () => {
    const scope = supplementProgrammeScopeFromEvidence(
      abundantGraceScopeBase,
      publishedReports.map((row) => ({
        studentId: row.studentId,
        courseName: row.courseName,
        programme: resolveProgrammeForCourseEvidence(abundantGraceScopeBase, row.courseName),
      })),
    );

    expect(scope).toHaveLength(2);
    expect(scope.find((row) => row.course === 'Scratch')?.enrolledStudents).toBe(18);
    expect(scope.find((row) => row.course === 'Python Programming')?.enrolledStudents).toBe(12);
  });

  it('builds per-course performance with correct student counts and programme labels', () => {
    const scope = supplementProgrammeScopeFromEvidence(abundantGraceScopeBase, publishedReports.map((row) => ({
      studentId: row.studentId,
      courseName: row.courseName,
      programme: resolveProgrammeForCourseEvidence(abundantGraceScopeBase, row.courseName),
    })));
    const programmeCoursePerformance = buildCourseGroupsFromPublishedReports(scope, publishedReports);

    expect(programmeCoursePerformance).toHaveLength(2);
    const scratch = programmeCoursePerformance.find((row) => row.course === 'Scratch');
    const python = programmeCoursePerformance.find((row) => row.course === 'Python Programming');
    expect(scratch?.programme).toBe('Young Innovators');
    expect(scratch?.students).toBe(18);
    expect(scratch?.enrolledStudents).toBe(18);
    expect(python?.programme).toBe('Teen Developers');
    expect(python?.students).toBe(12);
    expect(python?.enrolledStudents).toBe(12);
  });

  it('reconciles cumulative enrolments vs unique learners correctly', () => {
    const scope = supplementProgrammeScopeFromEvidence(abundantGraceScopeBase, publishedReports.map((row) => ({
      studentId: row.studentId,
      courseName: row.courseName,
      programme: resolveProgrammeForCourseEvidence(abundantGraceScopeBase, row.courseName),
    })));
    const programmeCoursePerformance = buildCourseGroupsFromPublishedReports(scope, publishedReports);
    const allLearnerIds = [...scratchLearnerIds, ...pythonLearnerIds];

    const counts = reconcileSchoolReportEnrolments({
      schoolProgrammes: scope.map(({ programme, course, enrolledStudents }) => ({
        programme,
        course,
        enrolledStudents,
      })),
      programmeCoursePerformance,
      learnerIds: allLearnerIds,
      activeStudents: allLearnerIds.length,
    });

    expect(counts.programmeEnrolments).toBe(30);
    expect(counts.totalStudents).toBe(30);
  });

  it('shows both courses in delivery summary when declaration covers only Scratch', () => {
    const scope = supplementProgrammeScopeFromEvidence(abundantGraceScopeBase, publishedReports.map((row) => ({
      studentId: row.studentId,
      courseName: row.courseName,
      programme: resolveProgrammeForCourseEvidence(abundantGraceScopeBase, row.courseName),
    })));
    const programmeCoursePerformance = buildCourseGroupsFromPublishedReports(scope, publishedReports);

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
      programmeCoursePerformance,
      schoolProgrammes: scope.map(({ programme, course, enrolledStudents }) => ({
        programme,
        course,
        enrolledStudents,
      })),
    });

    expect(summary.topics.map((row) => row.course)).toEqual(
      expect.arrayContaining(['Scratch', 'Python Programming']),
    );
    expect(summary.summaryLines.some((line) => line.includes('Python Programming'))).toBe(true);
  });

  it('renders two-course PDF preview when declaration and published reports disagree on scope', () => {
    const scope = supplementProgrammeScopeFromEvidence(abundantGraceScopeBase, publishedReports.map((row) => ({
      studentId: row.studentId,
      courseName: row.courseName,
      programme: resolveProgrammeForCourseEvidence(abundantGraceScopeBase, row.courseName),
    })));
    const programmeCoursePerformance = buildCourseGroupsFromPublishedReports(scope, publishedReports);

    const presentation = buildReportTopicsPresentation({
      school: { name: 'Abundant Grace Preparatory' } as any,
      period: { termLabel: 'Second Term', academicTermNumber: 1 } as any,
      summary: { curriculumCoverage: 0, activeStudents: 30, studentsWithScores: 30 } as any,
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
      programmeCoursePerformance,
      schoolProgrammes: scope.map(({ programme, course, enrolledStudents }) => ({
        programme,
        course,
        enrolledStudents,
      })),
    });

    expect(presentation?.sections).toHaveLength(2);
    expect(presentation?.plainText).toContain('Scratch');
    expect(presentation?.plainText).toContain('Python Programming');
  });

  it('resolves programme from scope when published report has course name only', () => {
    expect(
      resolveProgrammeForCourseEvidence(abundantGraceScopeBase, 'Python Programming'),
    ).toBe('Teen Developers');
    expect(
      resolveProgrammeForCourseEvidence(abundantGraceScopeBase, 'Scratch'),
    ).toBe('Young Innovators');
  });
});
