import { describe, expect, it } from 'vitest';
import {
  billedStudentsFromInvoice,
  invoiceMatchesAcademicPeriod,
  isAttachableInvoice,
  isSchoolStreamInvoice,
} from './invoice-match';

const reportPeriod = {
  academicYear: '2026/2027',
  termLabel: 'First Term',
  academicTermNumber: 1,
  academicTermId: 'term-abc',
};

describe('school report invoice matching', () => {
  it('treats school invoices with portal_user_id as school stream when school_id is set', () => {
    expect(
      isSchoolStreamInvoice({
        stream: null,
        school_id: 'school-1',
        portal_user_id: 'admin-user',
      }),
    ).toBe(true);
  });

  it('matches structured metadata from Finance Center builder', () => {
    expect(
      invoiceMatchesAcademicPeriod(
        {
          metadata: {
            academic_year: 2026,
            term_number: 1,
            period_label: '2026/2027',
            term_label: '2026/2027 · First Term',
            term_label_short: 'First Term',
          },
        },
        reportPeriod,
      ),
    ).toBe(true);
  });

  it('matches by academic_term_id when stored on invoice metadata', () => {
    expect(
      invoiceMatchesAcademicPeriod(
        {
          metadata: {
            academic_term_id: 'term-abc',
          },
        },
        reportPeriod,
      ),
    ).toBe(true);
  });

  it('rejects wrong term for same academic year', () => {
    expect(
      invoiceMatchesAcademicPeriod(
        {
          metadata: {
            period_label: '2026/2027',
            term_number: 2,
            term_label_short: 'Second Term',
          },
        },
        reportPeriod,
      ),
    ).toBe(false);
  });

  it('excludes draft invoices from attachable matches', () => {
    expect(isAttachableInvoice({ status: 'draft' })).toBe(false);
    expect(isAttachableInvoice({ status: 'sent' })).toBe(true);
  });

  it('reads billed learner count from invoice line items', () => {
    expect(
      billedStudentsFromInvoice({
        items: [
          { description: 'STEM Programme — Abundant Grace', quantity: 42 },
          { description: 'School Commission / Share (15%)', quantity: 1 },
        ],
      }),
    ).toBe(42);
  });
});
