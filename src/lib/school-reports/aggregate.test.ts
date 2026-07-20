import { describe, expect, it } from 'vitest';
import { invoiceMatchesAcademicPeriod } from './aggregate';

const period = { academicYear: '2026/2027', termLabel: 'First Term', academicTermNumber: 1 };

describe('school report academic invoice matching', () => {
  it('accepts a matching billing cycle label', () => {
    expect(invoiceMatchesAcademicPeriod({ billing_cycles: { term_label: 'First Term 2026/2027' } }, period)).toBe(true);
  });

  it('accepts matching structured invoice metadata', () => {
    expect(invoiceMatchesAcademicPeriod({ metadata: { academic_year: '2026/2027', term_number: 1 } }, period)).toBe(true);
  });

  it('rejects invoices from another term or academic year', () => {
    expect(invoiceMatchesAcademicPeriod({ billing_cycles: { term_label: 'Second Term 2026/2027' } }, period)).toBe(false);
    expect(invoiceMatchesAcademicPeriod({ metadata: { academic_year: '2025/2026', term_number: 1 } }, period)).toBe(false);
  });

  it('rejects unlabelled invoices instead of guessing by date', () => {
    expect(invoiceMatchesAcademicPeriod({ metadata: {}, due_date: '2026-10-10' }, period)).toBe(false);
  });
});
