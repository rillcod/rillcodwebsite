import { describe, expect, it } from 'vitest';
import { cleanStringArray } from './narrative';

/**
 * The model does not always answer a list field with sentences. The prompt asks
 * each concern to name its evidence, its action and its checkpoint, so it
 * sometimes returns those as object fields instead.
 */
describe('cleanStringArray', () => {
  it('never emits "[object Object]" into a report', () => {
    // This was live: `.map(String)` turned a structured concern into the literal
    // text "[object Object]", which then passed the non-empty filter and printed.
    const result = cleanStringArray([{ evidence: 'Coverage was 80%.', action: 'Review pacing.' }]);
    expect(result.join(' ')).not.toContain('[object Object]');
    expect(result[0]).toBe('Coverage was 80%. Review pacing.');
  });

  it('does not repeat a field the prose already stated', () => {
    // The action routinely restates the checkpoint, which read as
    // "...the start of the Second Term. Start of Second Term".
    const result = cleanStringArray([{
      action: 'We will review this at the start of the Second Term.',
      checkpoint: 'Start of the Second Term',
    }]);
    expect(result[0]).toBe('We will review this at the start of the Second Term.');
  });

  it('keeps plain strings untouched', () => {
    expect(cleanStringArray(['One.', '  Two.  '])).toEqual(['One.', 'Two.']);
  });

  it('drops entries with no usable text rather than stringifying them', () => {
    expect(cleanStringArray([null, undefined, {}, { nested: { deep: 'x' } }, ''])).toEqual([]);
  });

  it('accepts numbers and caps the list at six', () => {
    expect(cleanStringArray([1, 2])).toEqual(['1', '2']);
    expect(cleanStringArray(Array.from({ length: 10 }, (_, i) => `item ${i}`))).toHaveLength(6);
  });

  it('returns nothing for a non-array', () => {
    expect(cleanStringArray('nope')).toEqual([]);
    expect(cleanStringArray(null)).toEqual([]);
  });
});

describe('report text never leaks undefined or object literals', () => {
  it('names an unnamed class descriptively across every insight line', async () => {
    // Three separate lines interpolated class names raw. A class can legitimately
    // exist before it is named, and each one printed "undefined" into the report.
    const { buildSchoolReportInsights } = await import('./insights');
    const snapshot: any = {
      school: { id: 's', name: 'Test School' },
      period: { termLabel: 'First Term', academicYear: '2026/2027', academicTermNumber: 1, curriculumStart: { term: 1, week: 1 } },
      summary: {
        activeStudents: 20, activeTeachers: 2, activeStaff: 2, schoolAccounts: 1,
        averageScore: 80, attendanceRate: 90, curriculumCoverage: 90,
        assignmentsCreated: 5, submissionsReceived: 50, studentsWithScores: 18,
      },
      // Both classes deliberately unnamed, with a wide gap so the coaching and
      // highlight lines both fire.
      classPerformance: [
        { className: '', teacherName: 'Mrs Ade', students: 10, averageScore: 88, attendanceRate: 92, submissions: 30 },
        { className: null, teacherName: '', students: 10, averageScore: 55, attendanceRate: 80, submissions: 20 },
      ],
      scoreBands: [], attendanceBands: [], learners: [], programmeCoursePerformance: [],
      curriculum: { plannedWeeks: 10, completedWeeks: 9, inProgressWeeks: 1, skippedWeeks: 0, courses: [] },
      finance: { currency: 'NGN', invoiceCount: 0, totalInvoiced: 0, totalPaid: 0, totalOutstanding: 0, attached: false, requestMessage: null, billingHref: '', invoices: [] },
      dataNotes: [],
    };

    const insights = buildSchoolReportInsights(snapshot);
    const everyLine = [
      ...(insights.strengths ?? []),
      ...(insights.growthAreas ?? []),
      ...(insights.partnershipFocus ?? []),
      ...(insights.risks ?? []),
      ...(insights.learnerHighlights ?? []),
    ].join(' | ');

    expect(everyLine).not.toContain('undefined');
    expect(everyLine).not.toContain('null');
    expect(everyLine).not.toContain('[object Object]');
  });
});
