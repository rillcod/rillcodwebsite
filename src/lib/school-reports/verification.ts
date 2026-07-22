import { createHash } from 'node:crypto';

export function schoolReportVerificationCode(reportId: string): string {
  return `SR-${createHash('sha256').update(`school-report:${reportId}`).digest('hex').slice(0, 20).toUpperCase()}`;
}

export function schoolReportVerificationUrl(reportId: string): string {
  return `https://www.rillcod.com/verify/school-report/${schoolReportVerificationCode(reportId)}`;
}
