import { describe, expect, it } from 'vitest';
import {
  academicPeriodFromReportFields,
  financeParamsFromAcademicPeriod,
} from './academic-period';

describe('AcademicPeriodKey contract', () => {
  it('normalizes report fields into canonical finance params', () => {
    const period = academicPeriodFromReportFields({
      academicTermId: 'term-1',
      academicYear: '2026/2027',
      termLabel: 'First Term',
      academicTermNumber: 1,
    });
    expect(period.academicTermId).toBe('term-1');
    expect(period.periodLabel).toBe('2026/2027');
    expect(period.startYear).toBe('2026');
    expect(period.termNumber).toBe(1);

    const finance = financeParamsFromAcademicPeriod(period);
    expect(finance.academicYear).toBe('2026');
    expect(finance.periodLabel).toBe('2026/2027');
    expect(finance.termNumber).toBe('1');
  });

  it('accepts bare start year and maps to full period label', () => {
    const period = academicPeriodFromReportFields({
      academicTermId: 'term-2',
      academicYear: '2026',
      termLabel: 'Second Term',
      academicTermNumber: 2,
    });
    expect(period.periodLabel).toBe('2026/2027');
    expect(period.startYear).toBe('2026');
    expect(period.termNumber).toBe(2);
  });
});
