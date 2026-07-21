import type { ReportPreflightResult } from './preflight';

export type ReadinessStatus = 'ready' | 'blocked';

/** Classify whether a draft report book is ready for staff to generate/publish. */
export function classifyReadinessStatus(preflight: ReportPreflightResult): ReadinessStatus {
  if (!preflight.readyToGenerate || preflight.blocking) return 'blocked';
  const failedChecks = preflight.checks.filter((check) => check.status === 'fail');
  if (failedChecks.length > 0) return 'blocked';
  return 'ready';
}

export function readinessSummary(preflight: ReportPreflightResult): string {
  const status = classifyReadinessStatus(preflight);
  if (status === 'ready') {
    const warns = preflight.checks.filter((check) => check.status === 'warn');
    if (!warns.length) return 'All preflight checks passed — ready to generate the report book.';
    return `Ready to generate with ${warns.length} advisory warning${warns.length === 1 ? '' : 's'}.`;
  }
  const fails = preflight.checks.filter((check) => check.status === 'fail');
  if (fails.length) {
    return fails.map((check) => check.detail).slice(0, 2).join(' · ');
  }
  return 'Preflight blocked — resolve failed data sources before generating.';
}

export function shouldNotifyReadiness(
  reportId: string,
  status: ReadinessStatus,
  recentLogs: Array<{ report_id: string; status: string; notified_at: string | null; checked_at: string }>,
): boolean {
  if (status !== 'ready') return false;
  const today = new Date().toISOString().slice(0, 10);
  return !recentLogs.some(
    (row) =>
      row.report_id === reportId &&
      row.status === 'ready' &&
      row.notified_at &&
      row.notified_at.slice(0, 10) === today,
  );
}

export function readinessNotificationCopy(input: {
  schoolName: string;
  termLabel: string;
  academicYear: string;
  reportId: string;
}): { title: string; message: string; href: string } {
  const term = [input.termLabel, input.academicYear].filter(Boolean).join(' · ');
  return {
    title: `${input.schoolName} report book is ready`,
    message: `Preflight passed for ${term || 'this term'}. Open the editor to review and publish.`,
    href: `/dashboard/school-reports/${input.reportId}`,
  };
}
