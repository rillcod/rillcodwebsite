import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSchoolReportBillingHref, buildSchoolReportInvoiceEditHref } from '../finance-links';
import {
  diagnoseSchoolInvoices,
  invoiceMatchesAcademicPeriod,
  isActiveInvoice,
  isSchoolStreamInvoice,
} from '../invoice-match';
import { mapPaymentAccountRow } from '../payment-accounts';
import { recordSource, type DataSourceStatus } from '../source-query';
import type { SchoolReportFinanceLoadResult, SchoolReportRange } from './types';

type AnyClient = SupabaseClient<any>;

/** Load matched school invoices and payment accounts for a report term. */
export async function loadSchoolReportFinance(
  admin: AnyClient,
  schoolId: string,
  range: SchoolReportRange,
  checkedAt: string,
): Promise<SchoolReportFinanceLoadResult> {
  const [{ data: invoiceRows, error: invoiceError }, { data: paymentAccountRows, error: paymentAccountError }] =
    await Promise.all([
      admin
        .from('invoices')
        .select(
          'id,invoice_number,status,amount,amount_paid,amount_remaining,currency,due_date,metadata,stream,portal_user_id,school_id,billing_cycles(term_label,term_start_date)',
        )
        .eq('school_id', schoolId)
        .limit(1000),
      admin
        .from('payment_accounts')
        .select('id, label, bank_name, account_number, account_name, payment_note')
        .eq('is_active', true)
        .is('school_id', null)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

  const dataSources: DataSourceStatus[] = [
    recordSource('invoices', { error: invoiceError, rows: (invoiceRows ?? []) as any[], cap: 1000, checkedAt }),
    recordSource('payment_accounts', {
      error: paymentAccountError,
      rows: (paymentAccountRows ?? []) as any[],
      cap: 3,
      checkedAt,
    }),
  ];

  const selectedInvoices = ((invoiceRows ?? []) as any[])
    .filter(isSchoolStreamInvoice)
    .filter(isActiveInvoice)
    .filter((invoice) => invoiceMatchesAcademicPeriod(invoice, range));

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

  const financeCurrency = selectedInvoices.find((invoice) => invoice.currency)?.currency || 'NGN';
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

  const invoiceRequest = !invoices.length
    ? `Action required: generate or label a school invoice for ${range.termLabel}, ${range.academicYear}, then refresh this report so the invoice appendix can be attached.`
    : null;

  const invoiceMatchDiagnostics = diagnoseSchoolInvoices((invoiceRows ?? []) as any[], {
    academicYear: range.academicYear,
    termLabel: range.termLabel,
    academicTermNumber: range.academicTermNumber,
  });

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
      academicTermId: range.academicTermId,
      academicYear: range.academicYear,
      termLabel: range.termLabel,
      academicTermNumber: range.academicTermNumber,
      invoiceId: invoices[0]?.id ?? null,
    }),
    invoices,
    paymentAccounts,
    matchDiagnostics: invoices.length ? undefined : invoiceMatchDiagnostics,
  };

  return { data: finance, dataSources, invoiceRequest };
}
