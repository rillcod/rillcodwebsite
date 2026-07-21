import { describe, expect, it } from 'vitest';
import type { ReportPreflightResult } from './preflight';
import {
  classifyReadinessStatus,
  readinessNotificationCopy,
  readinessSummary,
  shouldNotifyReadiness,
} from './readiness-scan';

function preflight(overrides: Partial<ReportPreflightResult> = {}): ReportPreflightResult {
  return {
    checkedAt: new Date().toISOString(),
    readyToGenerate: true,
    blocking: false,
    sources: [],
    checks: [
      { key: 'school', label: 'School', status: 'pass', detail: 'ok' },
      { key: 'learners', label: 'Learners', status: 'pass', detail: 'ok' },
    ],
    curriculum: null,
    invoiceMatchCount: 1,
    matchedInvoices: [],
    billingHref: '/dashboard/finance',
    invoiceDiagnostics: null,
    ...overrides,
  };
}

describe('readiness scan helpers', () => {
  it('marks ready when preflight passes without failures', () => {
    expect(classifyReadinessStatus(preflight())).toBe('ready');
  });

  it('blocks when preflight is not ready to generate', () => {
    expect(classifyReadinessStatus(preflight({ readyToGenerate: false, blocking: true }))).toBe('blocked');
  });

  it('blocks when a check fails even if readyToGenerate is true', () => {
    expect(
      classifyReadinessStatus(
        preflight({
          checks: [{ key: 'curriculum', label: 'Curriculum', status: 'fail', detail: 'Query failed' }],
        }),
      ),
    ).toBe('blocked');
  });

  it('summarises advisory warnings for ready reports', () => {
    const summary = readinessSummary(
      preflight({
        checks: [
          { key: 'school', label: 'School', status: 'pass', detail: 'ok' },
          { key: 'invoice', label: 'Invoice', status: 'warn', detail: 'No invoice yet' },
        ],
      }),
    );
    expect(summary).toMatch(/advisory warning/i);
  });

  it('skips duplicate ready notifications on the same day', () => {
    const today = new Date().toISOString();
    expect(
      shouldNotifyReadiness('report-1', 'ready', [
        { report_id: 'report-1', status: 'ready', notified_at: today, checked_at: today },
      ]),
    ).toBe(false);
  });

  it('builds notification copy with editor link', () => {
    const copy = readinessNotificationCopy({
      schoolName: 'Adunt Grace',
      termLabel: 'First Term',
      academicYear: '2026/2027',
      reportId: 'abc-123',
    });
    expect(copy.title).toMatch(/Adunt Grace/);
    expect(copy.href).toBe('/dashboard/school-reports/abc-123');
  });
});
