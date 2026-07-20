import { describe, expect, it } from 'vitest';
import {
  buildSchoolReportBillingHref,
  buildSchoolReportInvoiceEditHref,
  FINANCE_BILLING_SCHOOL_PARAM,
  FINANCE_OPEN_SCHOOL_INVOICE_PARAM,
} from './finance-links';

describe('school report finance deep links', () => {
  it('builds a create-invoice link with school and term prefilled', () => {
    const href = buildSchoolReportBillingHref({
      schoolId: 'school-1',
      academicYear: '2026/2027',
      termLabel: 'First Term',
      academicTermNumber: 1,
    });
    expect(href).toContain('/dashboard/finance?');
    expect(href).toContain(`${FINANCE_BILLING_SCHOOL_PARAM}=school-1`);
    expect(href).toContain('academic_year=2026%2F2027');
    expect(href).toContain('term_number=1');
    expect(href).toContain(`${FINANCE_OPEN_SCHOOL_INVOICE_PARAM}=1`);
  });

  it('builds an edit-invoice link when invoice id is known', () => {
    const href = buildSchoolReportBillingHref({
      schoolId: 'school-1',
      academicYear: '2026/2027',
      termLabel: 'First Term',
      academicTermNumber: 1,
      invoiceId: 'inv-99',
    });
    expect(href).toBe(buildSchoolReportInvoiceEditHref('inv-99'));
    expect(href).toContain('edit_invoice=inv-99');
  });
});
