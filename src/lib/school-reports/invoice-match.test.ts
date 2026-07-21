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


  it('matches the Abundant Grace Third Term 2025/2026 invoice metadata', () => {
    expect(
      invoiceMatchesAcademicPeriod(
        {
          invoice_number: 'INV-2026-647245A8',
          school_id: '056cf646-b823-4b27-89d7-372f9731d521',
          stream: 'school',
          status: 'sent',
          billing_cycle_id: null,
          metadata: {
            term_label: '2025/2026 ? Third Term',
            term_number: 3,
            period_label: '2025/2026',
            academic_year: 2025,
            term_label_short: 'Third Term',
          },
        },
        {
          academicYear: '2025/2026',
          termLabel: 'Third Term',
          academicTermNumber: 3,
          academicTermId: 'e8a96170-def5-43e3-8bd8-c4b8d6f274d1',
        },
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
