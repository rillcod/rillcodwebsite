import { describe, expect, it } from 'vitest';
import { schoolReportVerificationCode, schoolReportVerificationUrl } from './verification';

describe('school report verification', () => {
  it('creates a stable non-sequential public code', () => {
    expect(schoolReportVerificationCode('report-1')).toMatch(/^SR-[A-F0-9]{20}$/);
    expect(schoolReportVerificationCode('report-1')).toBe(schoolReportVerificationCode('report-1'));
    expect(schoolReportVerificationUrl('report-1')).toContain(schoolReportVerificationCode('report-1'));
  });
});
