/** Query keys shared between school reports and Finance Center deep links. */
export const FINANCE_BILLING_SCHOOL_PARAM = 'billing_school';
export const FINANCE_ACADEMIC_YEAR_PARAM = 'academic_year';
export const FINANCE_TERM_NUMBER_PARAM = 'term_number';
export const FINANCE_OPEN_SCHOOL_INVOICE_PARAM = 'open_school_invoice';
export const FINANCE_EDIT_INVOICE_PARAM = 'edit_invoice';

export type SchoolReportFinanceLinkInput = {
  schoolId: string;
  academicYear: string;
  termLabel: string;
  academicTermNumber: number;
  /** When set, deep-link opens the invoice editor instead of a blank builder. */
  invoiceId?: string | null;
};

function financeBaseParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set('workspace', 'invoices');
  params.set('ops', 'invoices');
  return params;
}

/** Open Finance Center → Invoices with the school term invoice builder pre-filled. */
export function buildSchoolReportBillingHref(input: SchoolReportFinanceLinkInput): string {
  if (input.invoiceId) return buildSchoolReportInvoiceEditHref(input.invoiceId);

  const params = financeBaseParams();
  params.set(FINANCE_BILLING_SCHOOL_PARAM, input.schoolId);
  params.set(FINANCE_ACADEMIC_YEAR_PARAM, input.academicYear);
  params.set(FINANCE_TERM_NUMBER_PARAM, String(input.academicTermNumber));
  params.set(FINANCE_OPEN_SCHOOL_INVOICE_PARAM, '1');
  return `/dashboard/finance?${params.toString()}`;
}

/** Open Finance Center → Invoices with an existing school invoice loaded for edit. */
export function buildSchoolReportInvoiceEditHref(invoiceId: string): string {
  const params = financeBaseParams();
  params.set(FINANCE_EDIT_INVOICE_PARAM, invoiceId);
  return `/dashboard/finance?${params.toString()}`;
}

export function schoolReportFinanceLinkInput(snapshot: {
  school: { id: string };
  period: { academicYear: string; termLabel: string; academicTermNumber: number };
  finance: { invoices: Array<{ id: string }> };
}, invoiceId?: string | null): SchoolReportFinanceLinkInput {
  return {
    schoolId: snapshot.school.id,
    academicYear: snapshot.period.academicYear,
    termLabel: snapshot.period.termLabel,
    academicTermNumber: snapshot.period.academicTermNumber,
    invoiceId: invoiceId ?? snapshot.finance.invoices[0]?.id ?? null,
  };
}
