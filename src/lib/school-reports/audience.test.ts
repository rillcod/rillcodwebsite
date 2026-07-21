import { describe, expect, it } from 'vitest';
import {
  resolveSchoolReportAudience,
  shapeSchoolReportForAudience,
  shapeSchoolReportSnapshotForSchoolAudience,
} from './audience';
import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from './types';

function sampleSnapshot(): SchoolReportSnapshot {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
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
      activeStudents: 2,
      activeStaff: 1,
      activeTeachers: 1,
      schoolAccounts: 1,
      averageScore: 70,
      attendanceRate: 80,
      curriculumCoverage: 60,
      assignmentsCreated: 1,
      submissionsReceived: 2,
      studentsWithScores: 2,
    },
    scoreBands: [],
    attendanceBands: [],
    classPerformance: [
      {
        classId: 'c1',
        className: 'JSS1 A',
        teacherId: 't1',
        teacherName: 'Ada Teacher',
        students: 2,
        averageScore: 70,
        attendanceRate: 80,
        submissions: 2,
      },
    ],
    staff: {
      assignedTeachers: 1,
      schoolAccounts: 1,
      teachers: [{ id: 't1', name: 'Ada Teacher', source: 'class_owner', classCount: 1, classNames: ['JSS1 A'] }],
    },
    learners: [
      {
        id: 'l1',
        name: 'Amaka Okoro',
        className: 'JSS1 A',
        averageScore: 88,
        attendanceRate: 95,
        submissions: 1,
        status: 'Excellent',
        growthHints: ['Needs more practice with loops'],
      },
    ],
    programmeCoursePerformance: [],
    curriculum: { plannedWeeks: 10, completedWeeks: 6, inProgressWeeks: 2, skippedWeeks: 0, courses: [] },
    finance: {
      currency: 'NGN',
      invoiceCount: 1,
      totalInvoiced: 100000,
      totalPaid: 50000,
      totalOutstanding: 50000,
      attached: true,
      requestMessage: 'Internal staff note',
      billingHref: '/dashboard/school-billing',
      invoices: [
        {
          id: 'inv1',
          invoiceNumber: 'INV-001',
          status: 'partial',
          amount: 100000,
          paid: 50000,
          outstanding: 50000,
          dueDate: '2026-10-01',
          editHref: '/dashboard/finance/invoices/inv1',
        },
      ],
      matchDiagnostics: {
        reportPeriod: { academicYear: '2026/2027', termLabel: 'First Term', academicTermNumber: 1 },
        candidateCount: 1,
        hints: ['Near miss'],
        nearMisses: [],
      },
    },
    completeness: {
      readyToPublish: false,
      score: 50,
      totalRequired: 2,
      completedRequired: 1,
      items: [{ key: 'learners', label: 'Learners', ok: true, required: true, detail: 'Internal' }],
    },
    insights: {
      headline: 'Grace Academy term summary',
      strengths: [],
      risks: [],
      priorities: [],
      growthAreas: [],
      improvementAreas: [],
      academicCoverage: [],
      partnershipFocus: [],
      nextModuleFocus: [],
      nextPhaseSchool: [],
      nextPhaseLearners: [{ band: 'Excellent', count: 1, nextStep: 'Stretch projects' }],
      involvement: [],
      evidenceLedger: [],
      teacherDelivery: [],
      moduleCoverage: [],
      partnershipMilestones: [],
      deliveryCommitment: { planned: [], delivered: [], next: [] },
      celebrationWall: [{ name: 'Amaka Okoro', className: 'JSS1 A', highlight: '88% — excellent progress' }],
      learnerHighlights: ['Amaka Okoro (JSS1 A): 88% term average'],
      communityMessage: 'Grace Academy made strong progress.',
      programmeSpotlight: null,
      programmeSpotlights: [],
      suggestedPartnershipReview: 'December 2026',
      topClass: { className: 'JSS1 A', teacherName: 'Ada Teacher', averageScore: 70 },
      bottomClass: null,
      scoreEquityGap: 0,
      atRiskLearners: 0,
      excellentLearners: 1,
      classesWithTeacher: 1,
      classesTotal: 1,
      teacherCoveragePct: 100,
      evidenceQualityPct: 100,
    },
    dataNotes: ['Internal cap note'],
    dataSources: [{ source: 'students', status: 'ok', rowCount: 2, capped: false, required: true, checkedAt: '2026-01-01T00:00:00.000Z' }],
  };
}

describe('school report audience shaping', () => {
  it('resolves school audience from role', () => {
    expect(resolveSchoolReportAudience('school')).toBe('school');
    expect(resolveSchoolReportAudience('teacher')).toBe('staff');
    expect(resolveSchoolReportAudience('admin')).toBe('staff');
  });

  it('strips learner roster and internal diagnostics for school audience', () => {
    const shaped = shapeSchoolReportSnapshotForSchoolAudience(sampleSnapshot());
    expect(shaped.learners).toEqual([]);
    expect(shaped.staff?.teachers).toEqual([]);
    expect(shaped.classPerformance[0]?.teacherName).toBeNull();
    expect(shaped.finance?.invoices[0]).not.toHaveProperty('editHref');
    expect(shaped.finance?.matchDiagnostics).toBeUndefined();
    expect(shaped.dataSources).toBeUndefined();
    expect(shaped.dataNotes).toEqual([]);
    expect(shaped.insights?.learnerHighlights).toEqual([]);
    expect(shaped.insights?.celebrationWall[0]?.name).toBe('Learner');
  });

  it('leaves staff snapshots unchanged', () => {
    const report = {
      id: 'r1',
      school_id: 's1',
      title: 'Report',
      snapshot: sampleSnapshot(),
      narrative: { executiveSummary: 'Summary', achievements: [], concerns: [], recommendations: [], nextPeriodFocus: [] },
      lock_version: 3,
      working_revision_number: 2,
      created_by: 'staff-1',
    } as unknown as SchoolPerformanceReportRow;

    const staffView = shapeSchoolReportForAudience(report, 'staff');
    expect(staffView.snapshot.learners).toHaveLength(1);
    expect(staffView.lock_version).toBe(3);

    const schoolView = shapeSchoolReportForAudience(report, 'school');
    expect(schoolView.snapshot.learners).toEqual([]);
    expect(schoolView.working_revision_number).toBeNull();
  });
});
