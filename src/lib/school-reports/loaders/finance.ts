import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportBillingHref, buildSchoolReportInvoiceEditHref } from '../finance-links';
import {
  billedStudentsFromInvoice,
  diagnoseSchoolInvoices,
  invoiceMatchesAcademicPeriod,
  isActiveInvoice,
  isAttachableInvoice,
  isSchoolStreamInvoice,
  type SchoolReportAcademicPeriod,
} from '../invoice-match';
import { mapPaymentAccountRow } from '../payment-accounts';
import { recordSource, type DataSourceStatus } from '../source-query';
import type { SchoolReportFinanceLoadResult, SchoolReportRange } from './types';
import { DEFAULT_SCHOOL_REPORT_POLICY, invoiceEnrolmentTolerance, type SchoolReportPolicy } from '../report-policy';
import { fetchAllReportRows, reportPage } from '../paginated-query';

type AnyClient = SupabaseClient<any>;

/** Resolve canonical term/year from academic_terms when the report has a term id. */
export async function resolveFinanceReportPeriod(
  admin: AnyClient,
  range: SchoolReportRange,
): Promise<SchoolReportAcademicPeriod> {
  const base: SchoolReportAcademicPeriod = {
    academicYear: range.academicYear,
    termLabel: range.termLabel,
    academicTermNumber: range.academicTermNumber,
    academicTermId: range.academicTermId,
    periodStart: range.startDate,
    periodEnd: range.endDate,
  };
  if (!range.academicTermId) return base;

  const { data: term } = await admin
    .from('academic_terms')
    .select('term_number, academic_year, term_label, start_date, end_date')
    .eq('id', range.academicTermId)
    .maybeSingle();

  if (!term) return base;
  return {
    academicYear: String(term.academic_year || range.academicYear),
    termLabel: String(term.term_label || range.termLabel),
    academicTermNumber: Number(term.term_number) || range.academicTermNumber,
    academicTermId: range.academicTermId,
    periodStart: String(term.start_date || range.startDate),
    periodEnd: String(term.end_date || range.endDate),
  };
}

/** Load matched school invoices and payment accounts for a report term. */
export async function loadSchoolReportFinance(
  admin: AnyClient,
  schoolId: string,
  range: SchoolReportRange,
  checkedAt: string,
  opts?: { enrolledStudentCount?: number; reportPolicy?: SchoolReportPolicy },
): Promise<SchoolReportFinanceLoadResult> {
  const reportPeriod = await resolveFinanceReportPeriod(admin, range);
  const [invoiceResult, paymentAccountResult] = await Promise.all([
      fetchAllReportRows((from, to) => reportPage(admin
        .from('invoices')
        .select(
          'id,invoice_number,status,amount,amount_paid,amount_remaining,currency,due_date,metadata,stream,portal_user_id,school_id,billing_cycle_id,items,billing_cycles!invoices_billing_cycle_id_fkey(term_label,term_start_date)',
        )
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false }), from, to)),
      fetchAllReportRows((from, to) => reportPage(admin
        .from('payment_accounts')
        .select('id, label, bank_name, account_number, account_name, payment_note')
        .eq('is_active', true)
        .is('school_id', null)
        .order('created_at', { ascending: false }), from, to)),
    ]);
  const { data: invoiceRows, error: invoiceError } = invoiceResult;
  const { data: paymentAccountRows, error: paymentAccountError } = paymentAccountResult;

  const dataSources: DataSourceStatus[] = [
    recordSource('invoices', { error: invoiceError, rows: (invoiceRows ?? []) as any[], checkedAt }),
    recordSource('payment_accounts', {
      error: paymentAccountError,
      rows: (paymentAccountRows ?? []) as any[],
      checkedAt,
    }),
  ];

  const selectedInvoices = ((invoiceRows ?? []) as any[])
    .filter(isSchoolStreamInvoice)
    .filter(isAttachableInvoice)
    .filter((invoice) => invoiceMatchesAcademicPeriod(invoice, reportPeriod));

  const invoices = selectedInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status || 'pending',
    amount: Number(invoice.amount || 0),
    paid: Number(invoice.amount_paid || 0),
    outstanding: Number(
      invoice.amount_remaining ?? Math.max(0, Number(invoice.amount || 0) - Number(invoice.amount_paid || 0)),
    ),
    dueDate: invoice.due_date || null,
    editHref: buildSchoolReportInvoiceEditHref(invoice.id),
  }));

  const reportPolicy = opts?.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  const financeCurrency = selectedInvoices.find((invoice) => invoice.currency)?.currency || reportPolicy.finance.defaultCurrency;
  let paymentAccounts = ((paymentAccountRows ?? []) as Record<string, unknown>[])
    .map(mapPaymentAccountRow)
    .filter((row) => row.accountNumber.length > 0);

  const payToAccountId = selectedInvoices[0]?.metadata?.pay_to_account_id
    ? String(selectedInvoices[0].metadata.pay_to_account_id)
    : '';
  if (payToAccountId && paymentAccounts.length > 1) {
    paymentAccounts = [...paymentAccounts].sort((a, b) => {
      if (a.id === payToAccountId) return -1;
      if (b.id === payToAccountId) return 1;
      return 0;
    });
  }

  const billedStudents = selectedInvoices.reduce(
    (max, invoice) => Math.max(max, billedStudentsFromInvoice(invoice)),
    0,
  );
  const enrolledStudents = opts?.enrolledStudentCount ?? 0;
  const enrollmentAligned =
    !invoices.length || !enrolledStudents || !billedStudents
      ? invoices.length > 0
      : Math.abs(enrolledStudents - billedStudents) <= invoiceEnrolmentTolerance(reportPolicy, enrolledStudents);

  const invoiceRequest = !invoices.length
    ? `Action required: generate or label a school invoice for ${reportPeriod.termLabel}, ${reportPeriod.academicYear}, then refresh this report so the invoice appendix can be attached.`
    : null;

  const invoiceMatchDiagnostics = diagnoseSchoolInvoices((invoiceRows ?? []) as any[], reportPeriod);

  const finance = {
    currency: financeCurrency,
    invoiceCount: invoices.length,
    totalInvoiced: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paid, 0),
    totalOutstanding: invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
    attached: invoices.length > 0,
    requestMessage: invoiceRequest,
    billingHref: buildSchoolReportBillingHref({
      schoolId,
      academicTermId: reportPeriod.academicTermId,
      academicYear: reportPeriod.academicYear,
      termLabel: reportPeriod.termLabel,
      academicTermNumber: reportPeriod.academicTermNumber,
      invoiceId: invoices[0]?.id ?? null,
    }),
    invoices,
    paymentAccounts,
    enrolledStudents: enrolledStudents || undefined,
    billedStudents: billedStudents || undefined,
    enrollmentAligned,
    matchDiagnostics: invoices.length ? undefined : invoiceMatchDiagnostics,
  };

  return { data: finance, dataSources, invoiceRequest };
}
