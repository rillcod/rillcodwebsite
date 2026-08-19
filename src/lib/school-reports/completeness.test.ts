import { describe, expect, it } from 'vitest';
import { buildSchoolReportCompleteness } from './completeness';
import type { SchoolReportSnapshot } from './types';

function minimalSnapshot(overrides: Partial<SchoolReportSnapshot> = {}): SchoolReportSnapshot {
  return {
    school: { id: 'school-1', name: 'Test School' },
    period: {
      academicTermId: 'term-1',
      academicYear: '2025/2026',
      termLabel: 'First Term',
      academicTermNumber: 1,
      startDate: '2025-09-01',
      endDate: '2025-12-15',
      curriculumStart: { term: 1, week: 1 },
      curriculumEnd: { term: 1, week: 12 },
    },
    summary: {
      activeStudents: 10,
      activeTeachers: 2,
      averageScore: 72,
      attendanceRate: 88,
      curriculumCoverage: 75,
      studentsWithScores: 8,
      learnersWithAttendance: 5,
      attendanceFromManualRoll: 3,
      attendanceFromResultEntry: 2,
    },
    learners: [{ id: 's1', name: 'Ada', className: 'JSS1A' } as any],
    attendanceBands: [{ label: '90%+', count: 5 }],
    curriculum: { plannedWeeks: 12, completedWeeks: 10, inProgressWeeks: 1, skippedWeeks: 1, courses: [{ programme: 'Junior Tech', course: 'Robotics 101', planned: 12, completed: 10, inProgress: 1, skipped: 1, coverage: 83, enrolledStudents: 10 }] },
    schoolProgrammes: [{ programme: 'Junior Tech', course: 'Robotics 101', enrolledStudents: 10, classNames: [] }],
    deliveryDeclaration: {
      updatedAt: '2025-12-01T00:00:00.000Z',
      selectedTopicKeys: ['r::1::1'],
      selectedTopics: [{ key: 'r::1::1', programme: 'Junior Tech', course: 'Robotics 101', topic: 'Sensors and motor control', weekNumber: 1 }],
    } as any,
    classPerformance: [{ className: 'JSS1A', averageScore: 70, studentCount: 10 } as any],
    programmeCoursePerformance: [],
    finance: { invoiceCount: 0, attached: false, invoices: [], currency: 'NGN' } as any,
    dataSources: [{ source: 'learners', status: 'ok', required: true }],
    completeness: {
      readyToPublish: false,
      score: 0,
      totalRequired: 0,
      completedRequired: 0,
      items: [],
    },
    ...overrides,
  } as SchoolReportSnapshot;
}

describe('buildSchoolReportCompleteness curriculum priority and billing', () => {
  it('prioritizes curriculum delivery right after source health as item #2', () => {
    const report = buildSchoolReportCompleteness(minimalSnapshot());
    expect(report.items[0].key).toBe('source_health');
    expect(report.items[1].key).toBe('curriculum');
    expect(report.items[1].required).toBe(true);
    expect(report.items[1].ok).toBe(true);
  });

  it('blocks publication when curriculum has no planned weeks and names unmapped courses', () => {
    const report = buildSchoolReportCompleteness(
      minimalSnapshot({
        curriculum: {
          plannedWeeks: 0,
          completedWeeks: 0,
          inProgressWeeks: 0,
          skippedWeeks: 0,
          courses: [
            {
              programme: 'Junior Tech',
              course: 'Robotics 101',
              planned: 0,
              completed: 0,
              inProgress: 0,
              skipped: 0,
              coverage: 0,
              enrolledStudents: 10,
            },
          ],
        },
        deliveryDeclaration: { updatedAt: null, selectedTopics: [], selectedTopicKeys: [] } as any,
      }),
    );
    const curriculumItem = report.items.find((item) => item.key === 'curriculum');
    expect(curriculumItem?.ok).toBe(false);
    expect(curriculumItem?.detail).toContain('Robotics 101');
    expect(report.readyToPublish).toBe(false);
  });

  it('blocks publication when curriculum delivery declaration is unconfirmed', () => {
    const report = buildSchoolReportCompleteness(
      minimalSnapshot({
        deliveryDeclaration: null as any,
      }),
    );
    const curriculumItem = report.items.find((item) => item.key === 'curriculum');
    expect(curriculumItem?.ok).toBe(false);
    expect(curriculumItem?.detail).toContain('Robotics 101');
    expect(report.readyToPublish).toBe(false);
  });

  it('blocks publication when confirmed topics are canned placeholders', () => {
    const report = buildSchoolReportCompleteness(
      minimalSnapshot({
        deliveryDeclaration: {
          updatedAt: '2025-12-01T00:00:00.000Z',
          selectedTopicKeys: ['synthetic::r::1::1'],
          selectedTopics: [
            {
              key: 'synthetic::r::1::1',
              programme: 'Junior Tech',
              course: 'Robotics 101',
              topic: 'Week 1: Core concepts & guided practice',
              weekNumber: 1,
            },
          ],
        } as any,
      }),
    );
    const curriculumItem = report.items.find((item) => item.key === 'curriculum');
    expect(curriculumItem?.ok).toBe(false);
    expect(curriculumItem?.detail).toMatch(/Placeholder topics cannot be published/i);
    expect(report.readyToPublish).toBe(false);
  });

  it('accepts generated real topics as the term-syllabus workaround', () => {
    const report = buildSchoolReportCompleteness(
      minimalSnapshot({
        curriculum: {
          plannedWeeks: 14,
          completedWeeks: 0,
          inProgressWeeks: 0,
          skippedWeeks: 0,
          courses: [
            {
              programme: 'Junior Tech',
              course: 'Robotics 101',
              planned: 0,
              completed: 0,
              inProgress: 0,
              skipped: 0,
              coverage: 0,
              enrolledStudents: 10,
            },
          ],
        },
      }),
      { excludeBilling: true, excludeBillingReason: 'Pilot term' },
    );
    const curriculumItem = report.items.find((item) => item.key === 'curriculum');
    expect(curriculumItem?.ok).toBe(true);
    expect(report.readyToPublish).toBe(true);
  });

  it('requires a term invoice by default', () => {
    const report = buildSchoolReportCompleteness(minimalSnapshot());
    const invoice = report.items.find((item) => item.key === 'invoice');
    expect(invoice?.required).toBe(true);
    expect(invoice?.ok).toBe(false);
    expect(report.readyToPublish).toBe(false);
  });

  it('skips invoice requirement when excludeBilling is enabled', () => {
    const report = buildSchoolReportCompleteness(minimalSnapshot(), {
      excludeBilling: true,
      excludeBillingReason: 'Pilot term',
    });
    const invoice = report.items.find((item) => item.key === 'invoice');
    expect(invoice?.required).toBe(false);
    expect(invoice?.ok).toBe(true);
    expect(invoice?.detail).toContain('Pilot term');
    expect(report.readyToPublish).toBe(true);
  });

  it('treats attendance as missing when nobody has evidence, even if the roster is populated', () => {
    const report = buildSchoolReportCompleteness(
      minimalSnapshot({
        summary: {
          activeStudents: 10,
          activeTeachers: 2,
          averageScore: 72,
          attendanceRate: 0,
          curriculumCoverage: 75,
          studentsWithScores: 8,
          learnersWithAttendance: 0,
          attendanceFromManualRoll: 0,
          attendanceFromResultEntry: 0,
        },
        attendanceBands: [],
      }),
      { excludeBilling: true, excludeBillingReason: 'Pilot term' },
    );
    const attendance = report.items.find((item) => item.key === 'attendance');
    expect(attendance?.ok).toBe(false);
    expect(attendance?.detail).toMatch(/No published attendance/i);
    expect(attendance?.detail).not.toMatch(/10 learners have attendance/);
    expect(report.readyToPublish).toBe(false);
  });

  it('counts Report Builder and class-roll coverage without claiming the full roster', () => {
    const report = buildSchoolReportCompleteness(
      minimalSnapshot({
        summary: {
          activeStudents: 10,
          activeTeachers: 2,
          averageScore: 72,
          attendanceRate: 88,
          curriculumCoverage: 75,
          studentsWithScores: 8,
          learnersWithAttendance: 5,
          attendanceFromManualRoll: 2,
          attendanceFromResultEntry: 3,
        },
      }),
      { excludeBilling: true, excludeBillingReason: 'Pilot term' },
    );
    const attendance = report.items.find((item) => item.key === 'attendance');
    expect(attendance?.ok).toBe(true);
    expect(attendance?.detail).toContain('5 learners have attendance evidence');
    expect(attendance?.detail).toContain('2 from class roll');
    expect(attendance?.detail).toContain('3 from Report Builder');
    expect(attendance?.detail).toContain('3 learners still have scores without an attendance column');
  });
});
