import { describe, expect, it } from 'vitest';
import { buildSchoolReportInsights } from './insights';

describe('buildSchoolReportInsights', () => {
  it('computes equity gap, teacher coverage, and priorities from school-scoped classes', () => {
    const insights = buildSchoolReportInsights({
      school: { id: 's1', name: 'Grace Academy' },
      period: {
        startDate: '2026-09-01',
        endDate: '2026-12-15',
        academicTermId: 'term-1',
        academicYear: '2026/2027',
        termLabel: 'First Term',
        academicTermNumber: 1,
        curriculumStart: { term: 1, week: 1 },
        curriculumEnd: { term: 1, week: 12 },
      },
      summary: {
        activeStudents: 40,
        activeStaff: 5,
        activeTeachers: 4,
        schoolAccounts: 1,
        averageScore: 68,
        attendanceRate: 82,
        curriculumCoverage: 70,
        assignmentsCreated: 8,
        submissionsReceived: 120,
        studentsWithScores: 32,
      },
      classPerformance: [
        {
          classId: 'c1',
          className: 'JSS1 A',
          teacherId: 't1',
          teacherName: 'Ada',
          students: 20,
          averageScore: 80,
          attendanceRate: 90,
          submissions: 60,
        },
        {
          classId: 'c2',
          className: 'JSS1 B',
          teacherId: null,
          teacherName: null,
          students: 20,
          averageScore: 55,
          attendanceRate: 70,
          submissions: 40,
        },
      ],
      learners: [
        {
          id: '1',
          name: 'Amaka',
          className: 'JSS1 A',
          averageScore: 88,
          attendanceRate: 95,
          submissions: 4,
          status: 'Excellent',
        },
        {
          id: '2',
          name: 'Chidi',
          className: 'JSS1 B',
          averageScore: 40,
          attendanceRate: 50,
          submissions: 2,
          status: 'Needs support',
        },
      ],
      staff: {
        assignedTeachers: 4,
        schoolAccounts: 1,
        teachers: [],
      },
      curriculum: {
        plannedWeeks: 10,
        completedWeeks: 7,
        inProgressWeeks: 2,
        skippedWeeks: 1,
        courses: [],
      },
      finance: {
        currency: 'NGN',
        invoiceCount: 1,
        totalInvoiced: 100000,
        totalPaid: 80000,
        totalOutstanding: 20000,
        attached: true,
        requestMessage: null,
        billingHref: '/dashboard/school-billing',
        invoices: [],
      },
    });

    expect(insights.scoreEquityGap).toBe(25);
    expect(insights.teacherCoveragePct).toBe(50);
    expect(insights.atRiskLearners).toBe(1);
    expect(insights.topClass?.className).toBe('JSS1 A');
    expect(insights.bottomClass?.className).toBe('JSS1 B');
    expect(insights.priorities.some((item) => item.includes('JSS1 B'))).toBe(true);
    expect(insights.headline).toContain('Grace Academy');
  });
});
