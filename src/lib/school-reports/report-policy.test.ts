import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHOOL_REPORT_POLICY, invoiceEnrolmentTolerance, normalizeSchoolReportPolicy, schoolReportPhaseLabel } from './report-policy';

describe('school report policy', () => {
  it('merges partial settings without losing safe defaults', () => {
    const policy = normalizeSchoolReportPolicy({ grading: { excellentMin: 80 }, finance: { enrolmentTolerancePercent: 5 } });
    expect(policy.grading.excellentMin).toBe(80);
    expect(policy.grading.developingMin).toBe(50);
    expect(policy.finance.defaultCurrency).toBe('NGN');
  });
  it('supports programme-specific phases', () => {
    const policy = normalizeSchoolReportPolicy({ programmePhases: { Robotics: { '3': 'Autonomous Systems' } } });
    expect(schoolReportPhaseLabel(policy, 3, 'Robotics')).toBe('Autonomous Systems');
    expect(schoolReportPhaseLabel(policy, 3, 'Coding')).toBe('Innovation');
  });
  it('uses the configured invoice tolerance', () => {
    expect(invoiceEnrolmentTolerance(DEFAULT_SCHOOL_REPORT_POLICY, 50)).toBe(5);
  });
});
