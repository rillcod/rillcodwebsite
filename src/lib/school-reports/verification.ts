import { createHash } from 'node:crypto';

export function schoolReportVerificationCode(reportId: string): string {
  return `SR-${createHash('sha256').update(`school-report:${reportId}`).digest('hex').slice(0, 20).toUpperCase()}`;
}

export function schoolReportVerificationUrl(reportId: string): string {
  return `https://www.rillcod.com/verify/school-report/${schoolReportVerificationCode(reportId)}`;
}

/** Human-readable telephone & billing reference: e.g. RC-REP-2026-T1-8F32 */
export function formatHumanReportReference(reportId: string, year = '2026', termNum = 1): string {
  const hash = createHash('sha256').update(`school-report:${reportId}`).digest('hex').slice(0, 4).toUpperCase();
  const cleanYear = year.replace(/[^0-9]/g, '').slice(0, 4) || '2026';
  return `RC-REP-${cleanYear}-T${termNum}-${hash}`;
}
