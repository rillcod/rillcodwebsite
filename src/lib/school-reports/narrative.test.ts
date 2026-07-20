import { describe, expect, it } from 'vitest';
import { fallbackNarrative } from './narrative';
import type { SchoolReportSnapshot } from './types';

describe('school report fallback narrative', () => {
  it('uses only supplied aggregate values', () => {
    const snapshot = {
      school: { id: 'school-1', name: 'Example School' },
      period: { startDate: '2026-01-01', endDate: '2026-01-31', academicTermId: 'term-1', academicYear: '2025/2026', termLabel: 'First Term', academicTermNumber: 1, curriculumStart: { term: 1, week: 1 }, curriculumEnd: { term: 1, week: 4 } },
      summary: { activeStudents: 20, activeStaff: 9, activeTeachers: 8, schoolAccounts: 1, averageScore: 72, attendanceRate: 85, curriculumCoverage: 75, assignmentsCreated: 4, submissionsReceived: 40, studentsWithScores: 18 },
      curriculum: { plannedWeeks: 8, completedWeeks: 6, inProgressWeeks: 1, skippedWeeks: 0, courses: [] },
      generatedAt: '', scoreBands: [], attendanceBands: [], classPerformance: [], programmeCoursePerformance: [], finance: { currency: 'NGN', invoiceCount: 0, totalInvoiced: 0, totalPaid: 0, totalOutstanding: 0, invoices: [] }, dataNotes: [],
    } satisfies SchoolReportSnapshot;
    const narrative = fallbackNarrative(snapshot);
    expect(narrative.executiveSummary).toContain('20 active learners');
    expect(narrative.executiveSummary).toContain('72%');
    expect(narrative.recommendations.length).toBeGreaterThan(0);
  });
});
