import { describe, expect, it, vi } from 'vitest';
import { applySchoolReportPatch } from './service';
import type { SchoolPerformanceReportRow } from './types';

function baseReport(overrides: Partial<SchoolPerformanceReportRow> = {}): SchoolPerformanceReportRow {
  return {
    id: 'report-1',
    school_id: 'school-1',
    title: 'Test Report',
    period_start: '2026-01-01',
    period_end: '2026-03-31',
    curriculum_start_term: 1,
    curriculum_start_week: 1,
    curriculum_end_term: 1,
    curriculum_end_week: 12,
    academic_term_id: 'term-1',
    academic_year: '2026/2027',
    term_label: 'First Term',
    status: 'draft',
    snapshot: {
      generatedAt: new Date().toISOString(),
      school: { id: 'school-1', name: 'Test School' },
      period: {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        academicTermId: 'term-1',
        academicYear: '2026/2027',
        termLabel: 'First Term',
        academicTermNumber: 1,
        curriculumStart: { term: 1, week: 1 },
        curriculumEnd: { term: 1, week: 12 },
      },
      summary: {
        activeStudents: 0,
        activeStaff: 0,
        activeTeachers: 0,
        schoolAccounts: 0,
        averageScore: 0,
        attendanceRate: 0,
        curriculumCoverage: 0,
        assignmentsCreated: 0,
        submissionsReceived: 0,
        studentsWithScores: 0,
      },
      scoreBands: [],
      attendanceBands: [],
      classPerformance: [],
      learners: [],
      programmeCoursePerformance: [],
      curriculum: { plannedWeeks: 0, completedWeeks: 0, inProgressWeeks: 0, skippedWeeks: 0, courses: [] },
      finance: {
        currency: 'NGN',
        invoiceCount: 0,
        totalInvoiced: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        attached: false,
        requestMessage: null,
        billingHref: '/dashboard/finance',
        invoices: [],
      },
      completeness: {
        readyToPublish: false,
        score: 0,
        totalRequired: 1,
        completedRequired: 0,
        items: [{ key: 'invoice', label: 'School invoice for this term', ok: false, required: true, detail: '' }],
      },
      dataNotes: [],
    },
    narrative: {
      executiveSummary: 'Summary text for the report.',
      achievements: [],
      concerns: [],
      recommendations: [],
      nextPeriodFocus: [],
    },
    created_by: 'user-1',
    published_by: null,
    published_at: null,
    lock_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockAdmin(
  updateResult: { error: null | { message: string } } = { error: null },
  updatedRows: Array<{ id: string }> = [{ id: 'report-1' }],
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'academic_terms') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { term_number: 1 }, error: null })),
            })),
          })),
        };
      }
      if (table === 'schools') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { name: 'Test School' }, error: null })),
            })),
          })),
        };
      }
      if (table === 'course_curricula') {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        };
      }
      if (table === 'portal_users' || table === 'classes' || table === 'courses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  or: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
                in: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
              or: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [], error: null })),
                })),
              })),
              limit: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }
      return {
        // The patch now scopes its write to the lock_version it validated, so the
        // chain is update().eq(id).eq(lock_version).select(). `updatedRows` models
        // what the database actually matched: [] means another save won the race.
        update: vi.fn(() => {
          const chain: any = {
            eq: vi.fn(() => chain),
            select: vi.fn(async () => ({
              data: updateResult.error ? null : updatedRows,
              error: updateResult.error,
            })),
            then: (resolve: any, reject: any) => Promise.resolve(updateResult).then(resolve, reject),
          };
          return chain;
        }),
        // Re-read used only on the conflict path to report the winning version.
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { lock_version: 99, updated_at: new Date().toISOString() },
              error: null,
            })),
          })),
        })),
      };
    }),
  } as any;
}

describe('applySchoolReportPatch audit guards', () => {
  it('rejects forcePublish from non-admin teachers', async () => {
    const result = await applySchoolReportPatch(
      mockAdmin(),
      baseReport(),
      'teacher-1',
      { status: 'published', forcePublish: true, expectedRevision: 1 },
      { actorRole: 'teacher' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toMatch(/administrator/i);
    }
  });

  it('rejects forcePublish without override reason for admins', async () => {
    const result = await applySchoolReportPatch(
      mockAdmin(),
      baseReport(),
      'admin-1',
      { status: 'published', forcePublish: true, expectedRevision: 1 },
      { actorRole: 'admin' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('returns REPORT_CONFLICT code when expectedRevision is stale', async () => {
    const result = await applySchoolReportPatch(
      mockAdmin(),
      baseReport({ lock_version: 3 }),
      'admin-1',
      {
        narrative: { executiveSummary: 'Updated summary text here.' },
        expectedRevision: 2,
      },
      { actorRole: 'admin' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.code).toBe('REPORT_CONFLICT');
      expect(result.lockVersion).toBe(3);
    }
  });

  it('accepts delivery declaration without expectedRevision using current lock', async () => {
    const result = await applySchoolReportPatch(
      mockAdmin(),
      baseReport({ lock_version: 4 }),
      'admin-1',
      {
        deliveryDeclaration: { selectedTopicKeys: ['cur-1::1::1'] },
      },
      { actorRole: 'admin' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lockVersion).toBe(5);
  });

  it('returns REPORT_CONFLICT when a concurrent save wins the race at the database', async () => {
    // Both staff loaded the report at lock_version 2, so BOTH pass the in-process
    // expectedRevision check. Only the conditional write can arbitrate: the loser
    // matches zero rows and must be told to reload, not allowed to overwrite.
    const result = await applySchoolReportPatch(
      mockAdmin({ error: null }, []),
      baseReport({ lock_version: 2 }),
      'admin-2',
      {
        narrative: { executiveSummary: 'Second author overwriting text.' },
        expectedRevision: 2,
      },
      { actorRole: 'admin' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.code).toBe('REPORT_CONFLICT');
      // Reports the version that actually won, so the client reloads to the truth.
      expect(result.lockVersion).toBe(99);
    }
  });

  it('increments lock_version on successful narrative save', async () => {
    const result = await applySchoolReportPatch(
      mockAdmin(),
      baseReport({ lock_version: 2 }),
      'admin-1',
      {
        narrative: { executiveSummary: 'Updated summary text here.' },
        expectedRevision: 2,
      },
      { actorRole: 'admin' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lockVersion).toBe(3);
  });

  it('rejects withdrawing a published report from teachers', async () => {
    const result = await applySchoolReportPatch(
      mockAdmin(),
      baseReport({ status: 'published', published_revision_number: 1 }),
      'teacher-1',
      { status: 'archived', expectedRevision: 1, withdrawReason: 'School requested removal of live report.' },
      { actorRole: 'teacher' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toMatch(/administrator/i);
    }
  });

  it('requires a withdrawal reason for admins', async () => {
    const result = await applySchoolReportPatch(
      mockAdmin(),
      baseReport({ status: 'published', published_revision_number: 1 }),
      'admin-1',
      { status: 'archived', expectedRevision: 1, withdrawReason: 'short' },
      { actorRole: 'admin' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
