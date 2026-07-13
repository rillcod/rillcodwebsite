import { describe, expect, it } from 'vitest';
import {
  buildSchoolTermMetadata,
  extractSchoolTermFromMetadata,
  schoolTermsEqual,
  schoolSessionDisplay,
} from './school-term';

describe('finance school term session isolation', () => {
  it('normalizes start-year and slash period to the same session', () => {
    const a = extractSchoolTermFromMetadata({ academic_year: 2025, term_number: 3 });
    const b = extractSchoolTermFromMetadata({ academic_year: '2025/2026', term_number: '3' });
    expect(a?.periodLabel).toBe('2025/2026');
    expect(b?.periodLabel).toBe('2025/2026');
    expect(schoolTermsEqual(
      { academicYear: a!.academicYear, termNumber: a!.termNumber },
      { academicYear: b!.academicYear, termNumber: b!.termNumber },
    )).toBe(true);
  });

  it('keeps consecutive First Terms distinct', () => {
    const cur = extractSchoolTermFromMetadata({ academic_year: '2025', term_number: 1 });
    const next = extractSchoolTermFromMetadata({ academic_year: '2026', term_number: 1 });
    expect(cur?.periodLabel).toBe('2025/2026');
    expect(next?.periodLabel).toBe('2026/2027');
    expect(schoolTermsEqual(
      { academicYear: cur!.academicYear, termNumber: cur!.termNumber },
      { academicYear: next!.academicYear, termNumber: next!.termNumber },
    )).toBe(false);
  });

  it('parses combined billing-cycle display labels', () => {
    const fromPeriodFirst = extractSchoolTermFromMetadata({
      term_label: '2025/2026 · Third Term',
    });
    const fromTermFirst = extractSchoolTermFromMetadata({
      term_label: 'First Term · 2026/2027',
    });
    expect(fromPeriodFirst).toMatchObject({
      periodLabel: '2025/2026',
      termLabel: 'Third Term',
      termNumber: '3',
    });
    expect(fromTermFirst).toMatchObject({
      periodLabel: '2026/2027',
      termLabel: 'First Term',
      termNumber: '1',
    });
  });

  it('writes metadata that stays separable for past/present/future', () => {
    const meta = buildSchoolTermMetadata('2025', 3, { payment_method: 'bank_transfer' });
    expect(meta).toMatchObject({
      academic_year: 2025,
      term_number: 3,
      period_label: '2025/2026',
      term_label_short: 'Third Term',
      payment_method: 'bank_transfer',
    });
    expect(meta.term_label).toBe(schoolSessionDisplay('2025', '3'));
    expect(String(meta.term_label)).toContain('2025/2026');
    expect(String(meta.term_label)).toContain('Third Term');
  });
});
