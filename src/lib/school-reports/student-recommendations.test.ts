import { describe, expect, it } from 'vitest';
import { buildStudentRecommendations, describeSchoolAttendance, isStudentFacingRecommendation } from './student-recommendations';
import type { SchoolReportSnapshot } from './types';

const baseSnapshot = {
  school: { id: 'school-1', name: 'Example School' },
  period: {
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    academicTermId: 'term-1',
    academicYear: '2025/2026',
    termLabel: 'First Term',
    academicTermNumber: 1,
    curriculumStart: { term: 1, week: 1 },
    curriculumEnd: { term: 1, week: 4 },
  },
  summary: {
    activeStudents: 20,
    activeStaff: 9,
    activeTeachers: 8,
    schoolAccounts: 1,
    averageScore: 72,
    attendanceRate: 69,
    curriculumCoverage: 75,
    assignmentsCreated: 4,
    submissionsReceived: 40,
    studentsWithScores: 18,
    learnersWithAttendance: 20,
    attendanceFromResultEntry: 15,
    attendanceFromManualRoll: 5,
  },
  curriculum: { plannedWeeks: 8, completedWeeks: 6, inProgressWeeks: 1, skippedWeeks: 0, courses: [] },
  generatedAt: '',
  scoreBands: [],
  attendanceBands: [],
  classPerformance: [],
  learners: [
    {
      id: 's1',
      name: 'Ada',
      className: 'JSS1 · A',
      averageScore: 80,
      attendanceRate: 44,
      submissions: 3,
      status: 'Attendance risk' as const,
    },
  ],
  programmeCoursePerformance: [],
  finance: {
    currency: 'NGN',
    invoiceCount: 0,
    totalInvoiced: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    attached: false,
    requestMessage: null,
    billingHref: '/dashboard/school-billing',
    invoices: [],
  },
  completeness: { readyToPublish: false, score: 0, totalRequired: 1, completedRequired: 0, items: [] },
  dataNotes: [],
} satisfies SchoolReportSnapshot;

describe('student recommendations', () => {
  it('uses school-wide attendance in the canonical attendance line', () => {
    expect(describeSchoolAttendance(baseSnapshot)).toContain('69%');
    expect(describeSchoolAttendance(baseSnapshot)).toContain('20 learners with evidence');
    expect(describeSchoolAttendance(baseSnapshot)).not.toContain('44%');
  });

  it('still reports 0% when learners have evidence of absence', () => {
    expect(
      describeSchoolAttendance({
        ...baseSnapshot,
        summary: { ...baseSnapshot.summary, attendanceRate: 0, learnersWithAttendance: 8 },
      }),
    ).toContain('0%');
  });

  it('does not treat a 0% average as coverage when nobody has attendance evidence', () => {
    expect(
      describeSchoolAttendance({
        ...baseSnapshot,
        summary: { ...baseSnapshot.summary, attendanceRate: 0, learnersWithAttendance: 0 },
      }),
    ).toMatch(/still being captured/i);
  });

  it('reports coverage against the roster when only some learners have evidence', () => {
    expect(
      describeSchoolAttendance({
        ...baseSnapshot,
        summary: { ...baseSnapshot.summary, learnersWithAttendance: 5 },
      }),
    ).toContain('5 learners of 20 with evidence');
  });

  it('does not surface per-learner attendance percentages in student recommendations', () => {
    const items = buildStudentRecommendations(baseSnapshot);
    expect(items.join(' ')).not.toMatch(/now 44%/i);
    expect(items.join(' ')).not.toMatch(/Improve attendance \(now/i);
  });

  it('filters partnership coaching lines out of student-facing checks', () => {
    expect(isStudentFacingRecommendation('Coach JSS1 with the leading class.')).toBe(false);
    expect(isStudentFacingRecommendation('Practise one key skill each day.')).toBe(true);
  });
});
