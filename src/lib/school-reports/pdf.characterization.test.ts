import { describe, expect, it } from 'vitest';
import { buildSchoolReportPdfDefinition } from './pdf';
import type { SchoolPerformanceReportRow } from './types';

/**
 * Characterization tests — a safety net for restructuring pdf.ts.
 *
 * This module had no tests at all, so any refactor of its ~2,100 lines was
 * unverifiable. These assertions pin the OBSERVABLE shape of the generated
 * pdfmake document (page setup, section presence, ordering, data plumbed
 * through) without freezing incidental styling, so layout can still be改 tuned
 * while structural regressions are caught.
 *
 * They describe what the builder does today — not necessarily what it ideally
 * should do. Deliberate output changes should update these expectations.
 */

function fixtureReport(overrides: Partial<SchoolPerformanceReportRow> = {}): SchoolPerformanceReportRow {
  return {
    id: 'report-pdf-1',
    school_id: 'school-1',
    title: 'Term Delivery Report',
    period_start: '2026-01-01',
    period_end: '2026-03-31',
    curriculum_start_term: 1,
    curriculum_start_week: 1,
    curriculum_end_term: 1,
    curriculum_end_week: 10,
    academic_term_id: 'term-1',
    academic_year: '2026/2027',
    term_label: 'First Term',
    status: 'published',
    verification_code: 'SR-ABCDEF0123456789ABCD',
    snapshot: {
      generatedAt: '2026-04-01T00:00:00.000Z',
      school: { id: 'school-1', name: 'Bright Future Academy' },
      period: {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        academicTermId: 'term-1',
        academicYear: '2026/2027',
        termLabel: 'First Term',
        academicTermNumber: 1,
        curriculumStart: { term: 1, week: 1 },
        curriculumEnd: { term: 1, week: 10 },
      },
      summary: {
        activeStudents: 24,
        activeStaff: 3,
        activeTeachers: 3,
        schoolAccounts: 1,
        averageScore: 72,
        attendanceRate: 91,
        curriculumCoverage: 80,
        assignmentsCreated: 12,
        submissionsReceived: 210,
        studentsWithScores: 22,
      },
      scoreBands: [],
      attendanceBands: [],
      classPerformance: [],
      learners: [
        { name: 'Ada Obi', averageScore: 88, attendanceRate: 95 },
        { name: 'Bola Ade', averageScore: 64, attendanceRate: 88 },
      ],
      programmeCoursePerformance: [],
      curriculum: { plannedWeeks: 10, completedWeeks: 8, inProgressWeeks: 1, skippedWeeks: 1, courses: [] },
      finance: {
        currency: 'NGN',
        invoiceCount: 1,
        totalInvoiced: 100000,
        totalPaid: 100000,
        totalOutstanding: 0,
        attached: true,
        requestMessage: null,
        billingHref: '/dashboard/finance',
        invoices: [],
      },
      completeness: {
        readyToPublish: true,
        score: 100,
        totalRequired: 1,
        completedRequired: 1,
        items: [],
      },
      dataNotes: [],
    },
    narrative: {
      executiveSummary: 'Delivery held steady across the term with strong attendance.',
      achievements: ['Attendance averaged 91%.'],
      concerns: ['Two learners need additional practice time.'],
      recommendations: ['Run a short revision clinic before the next assessment.'],
      nextPeriodFocus: ['Begin the robotics module.'],
    },
    created_by: 'user-1',
    published_by: 'user-1',
    published_at: '2026-04-01T00:00:00.000Z',
    lock_version: 1,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  } as SchoolPerformanceReportRow;
}

/** Flatten every string in the document definition so section presence can be asserted. */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectText(item, out);
    return out;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) collectText(value, out);
  }
  return out;
}

describe('buildSchoolReportPdfDefinition', () => {
  it('produces a page-configured pdfmake definition', () => {
    const def = buildSchoolReportPdfDefinition(fixtureReport()) as Record<string, any>;
    expect(def).toBeTruthy();
    expect(Array.isArray(def.content)).toBe(true);
    expect(def.content.length).toBeGreaterThan(0);
    expect(def.pageSize).toBeDefined();
    expect(def.pageMargins).toBeDefined();
  });

  it('reserves enough top space for the repeating client header', () => {
    const def = buildSchoolReportPdfDefinition(fixtureReport()) as Record<string, any>;
    expect(def.pageMargins).toEqual([40, 48, 40, 44]);
  });

  it('carries the school and term identity into the document', () => {
    const text = collectText(buildSchoolReportPdfDefinition(fixtureReport())).join(' | ');
    expect(text).toContain('Bright Future Academy');
    expect(text).toContain('First Term');
  });

  it('includes the verification code so a published book can be checked', () => {
    const text = collectText(buildSchoolReportPdfDefinition(fixtureReport())).join(' | ');
    expect(text).toContain('SR-ABCDEF0123456789ABCD');
  });

  it('renders the core delivery sections', () => {
    const text = collectText(buildSchoolReportPdfDefinition(fixtureReport())).join(' | ');
    expect(text).toContain('Curriculum delivery');
    expect(text).toContain('What we taught');
    expect(text).toContain('Evidence captured');
  });

  it('never prints a raw undefined into a learner line', () => {
    // A learner with no class placement once produced
    // "Bola Ade (undefined): 64% term average" in a document sent to the school.
    const report = fixtureReport();
    const text = collectText(
      buildSchoolReportPdfDefinition({
        ...report,
        snapshot: {
          ...report.snapshot,
          learners: [
            { name: 'Ada Obi', averageScore: 88, attendanceRate: 95 },
            { name: 'Bola Ade', averageScore: 64, attendanceRate: 88 },
          ],
        },
      } as SchoolPerformanceReportRow),
    ).join(' | ');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('(null)');
    expect(text).toContain('Bola Ade');
  });

  it('honours section toggles from the design config', () => {
    const withFinance = collectText(
      buildSchoolReportPdfDefinition(fixtureReport({ design: { sections: { finance: true } } } as any)),
    ).join(' | ');
    const withoutFinance = collectText(
      buildSchoolReportPdfDefinition(fixtureReport({ design: { sections: { finance: false } } } as any)),
    ).join(' | ');
    // Turning a section off must actually shrink the document.
    expect(withoutFinance.length).toBeLessThan(withFinance.length);
  });

  it('builds a draft book without requiring publication fields', () => {
    const def = buildSchoolReportPdfDefinition(
      fixtureReport({ status: 'draft', published_at: null, published_by: null }),
    ) as Record<string, any>;
    expect(Array.isArray(def.content)).toBe(true);
    expect(def.content.length).toBeGreaterThan(0);
  });

  it('survives a snapshot with no learners', () => {
    const report = fixtureReport();
    const def = buildSchoolReportPdfDefinition({
      ...report,
      snapshot: { ...report.snapshot, learners: [] },
    } as SchoolPerformanceReportRow) as Record<string, any>;
    expect(Array.isArray(def.content)).toBe(true);
    expect(def.content.length).toBeGreaterThan(0);
    const text = collectText(def).join(' | ');
    expect(text).not.toContain('Learner roster is not included');
    expect(text).not.toContain('No learner records are included');
  });
});
