import {
  extractSchoolTermFromMetadata,
  schoolTermsEqual,
} from '@/lib/finance/school-term';
import {
  labelFromTermNumber,
  periodFromStartYear,
  periodStartYear,
  termNumberFromLabel,
} from '@/lib/reports/academic-period';
import { academicPeriodFromReportFields, type AcademicPeriodKey } from './academic-period';
import { buildSchoolReportInvoiceEditHref } from './finance-links';

/** @deprecated Prefer AcademicPeriodKey — kept for invoice matcher compatibility. */
export type SchoolReportAcademicPeriod = {
  academicYear: string;
  termLabel: string;
  academicTermNumber: number;
  academicTermId?: string;
};

export function toAcademicPeriodKey(period: SchoolReportAcademicPeriod): AcademicPeriodKey {
  return academicPeriodFromReportFields({
    academicTermId: period.academicTermId,
    academicYear: period.academicYear,
    termLabel: period.termLabel,
    academicTermNumber: period.academicTermNumber,
  });
}

export function isSchoolStreamInvoice(invoice: {
  stream?: string | null;
  school_id?: string | null;
  portal_user_id?: string | null;
}): boolean {
  return invoice.stream === 'school' || !!(invoice.school_id && !invoice.portal_user_id);
}

export function isActiveInvoice(invoice: { status?: string | null }): boolean {
  return !['cancelled', 'void'].includes(String(invoice.status || '').toLowerCase());
}

/** Exact year token (avoids partial year bleed). */
function labelHasAcademicYear(label: string, academicYear: string): boolean {
  const year = academicYear.toLowerCase().trim();
  if (!year) return false;
  if (label.includes(year)) return true;
  const alt = year.replace(/\//g, '-');
  return alt !== year && label.includes(alt);
}

/**
 * Term match without substring false-positives ("term 1" must not match "term 12").
 */
function labelMatchesTerm(label: string, termLabel: string, termNumber: number): boolean {
  const normalizedLabel = label.toLowerCase().replace(/\s+/g, ' ').trim();
  const want = termLabel.toLowerCase().replace(/\s+/g, ' ').trim();
  if (want && (normalizedLabel === want || normalizedLabel.includes(want))) {
    const wantNum = want.match(/\bterm\s*(\d+)\b/);
    const labelNum = normalizedLabel.match(/\bterm\s*(\d+)\b/);
    if (wantNum && labelNum && wantNum[1] !== labelNum[1]) return false;
    return true;
  }
  if (!Number.isFinite(termNumber) || termNumber <= 0) return false;
  const termToken = new RegExp(`(?:^|[^0-9])term\\s*${termNumber}(?:[^0-9]|$)`, 'i');
  return termToken.test(normalizedLabel);
}

function invoiceCycleLabel(invoice: any): string {
  const metadata = invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
  const cycle = Array.isArray(invoice?.billing_cycles) ? invoice.billing_cycles[0] : invoice?.billing_cycles;
  return String(cycle?.term_label || metadata.term_label || metadata.academic_term || '').trim();
}

function invoiceMetadataYear(invoice: any): string {
  const metadata = invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
  return String(metadata.academic_year || metadata.academicYear || metadata.period_label || '').trim();
}

/** Builder + Finance deep links expect session start year ("2026"), not full "2026/2027". */
export function normalizeFinanceAcademicYearParam(academicYear: string): string {
  const period = periodFromStartYear(academicYear);
  return periodStartYear(period || academicYear) || academicYear;
}

export function reportPeriodFromFinanceKeys(
  academicYear: string,
  termNumber: string | number,
): SchoolReportAcademicPeriod {
  const periodLabel = periodFromStartYear(academicYear) || academicYear;
  const num = Number(termNumber);
  return {
    academicYear: periodLabel,
    termLabel: labelFromTermNumber(termNumber),
    academicTermNumber: Number.isFinite(num) && num > 0 ? num : parseInt(termNumberFromLabel(String(termNumber)), 10),
  };
}

export function invoiceMatchesAcademicPeriod(
  invoice: any,
  period: Pick<SchoolReportAcademicPeriod, 'academicYear' | 'termLabel' | 'academicTermNumber'>,
): boolean {
  const invoiceTerm = extractSchoolTermFromMetadata(invoice?.metadata);
  if (invoiceTerm) {
    return schoolTermsEqual(
      { academicYear: invoiceTerm.academicYear, termNumber: invoiceTerm.termNumber },
      { academicYear: period.academicYear, termNumber: String(period.academicTermNumber) },
    );
  }

  const metadata = invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
  const label = invoiceCycleLabel(invoice).toLowerCase();
  const metadataYear = invoiceMetadataYear(invoice).toLowerCase();
  const structuredTerm = Number(metadata.term_number ?? metadata.termNumber);
  const reportPeriod = periodFromStartYear(period.academicYear) || period.academicYear;
  const yearMatches =
    metadataYear === reportPeriod.toLowerCase() ||
    metadataYear === periodStartYear(reportPeriod) ||
    labelHasAcademicYear(label, reportPeriod) ||
    labelHasAcademicYear(metadataYear, reportPeriod);
  if (!yearMatches) return false;

  if (Number.isFinite(structuredTerm) && structuredTerm > 0) {
    return structuredTerm === period.academicTermNumber;
  }
  return labelMatchesTerm(label, period.termLabel, period.academicTermNumber);
}

/** Staff-facing reasons when an invoice exists but does not attach to this report. */
export function explainInvoiceMismatch(
  invoice: any,
  period: SchoolReportAcademicPeriod,
): string[] {
  if (!isSchoolStreamInvoice(invoice)) {
    return ['Invoice is individual/parent stream, not school'];
  }
  if (!isActiveInvoice(invoice)) {
    return [`Invoice status is ${String(invoice.status || 'unknown')} (inactive)`];
  }
  if (invoiceMatchesAcademicPeriod(invoice, period)) return [];

  const reportPeriod = periodFromStartYear(period.academicYear) || period.academicYear;
  const invoiceTerm = extractSchoolTermFromMetadata(invoice?.metadata);
  if (invoiceTerm) {
    const reasons: string[] = [];
    if (
      !schoolTermsEqual(
        { academicYear: invoiceTerm.academicYear, termNumber: invoiceTerm.termNumber },
        { academicYear: period.academicYear, termNumber: String(period.academicTermNumber) },
      )
    ) {
      if (invoiceTerm.periodLabel !== reportPeriod) {
        reasons.push(`Wrong year — report is ${reportPeriod}, invoice is ${invoiceTerm.periodLabel}`);
      }
      if (invoiceTerm.termNumber !== String(period.academicTermNumber)) {
        reasons.push(`Wrong term — report is ${period.termLabel}, invoice is ${invoiceTerm.termLabel}`);
      }
    }
    return reasons.length ? reasons : ['Term/year mismatch on structured metadata'];
  }

  const metadata = invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
  const label = invoiceCycleLabel(invoice);
  const metadataYear = invoiceMetadataYear(invoice);
  const structuredTerm = Number(metadata.term_number ?? metadata.termNumber);
  const hasAnyLabel =
    !!label ||
    !!metadataYear ||
    (Number.isFinite(structuredTerm) && structuredTerm > 0);

  if (!hasAnyLabel) {
    return ['Invoice has no term_number / academic_year / period_label (old or manual invoice)'];
  }

  const reasons: string[] = [];
  const yearMatches =
    metadataYear === reportPeriod.toLowerCase() ||
    metadataYear === periodStartYear(reportPeriod) ||
    labelHasAcademicYear(label.toLowerCase(), reportPeriod) ||
    labelHasAcademicYear(metadataYear.toLowerCase(), reportPeriod);
  if (!yearMatches) {
    const invoiceYear =
      periodFromStartYear(metadataYear) ||
      (label.match(/(\d{4}\s*\/\s*\d{4})/)?.[1]?.replace(/\s+/g, '/') ?? metadataYear) ||
      'unknown year';
    reasons.push(`Wrong year — report is ${reportPeriod}, invoice is ${invoiceYear}`);
  }
  if (Number.isFinite(structuredTerm) && structuredTerm > 0 && structuredTerm !== period.academicTermNumber) {
    reasons.push(`Wrong term — report is ${period.termLabel}, invoice is ${labelFromTermNumber(structuredTerm)}`);
  } else if (label && !labelMatchesTerm(label.toLowerCase(), period.termLabel, period.academicTermNumber)) {
    reasons.push(`Wrong term — report is ${period.termLabel}, invoice label is "${label}"`);
  }
  return reasons.length ? reasons : ['Could not match invoice to this report period'];
}

export type InvoiceMatchDiagnostics = {
  reportPeriod: SchoolReportAcademicPeriod;
  candidateCount: number;
  hints: string[];
  nearMisses: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    reasons: string[];
    editHref: string;
  }>;
};

export function diagnoseSchoolInvoices(
  invoices: any[],
  period: SchoolReportAcademicPeriod,
): InvoiceMatchDiagnostics {
  const schoolInvoices = invoices.filter(isSchoolStreamInvoice);
  const activeSchoolInvoices = schoolInvoices.filter(isActiveInvoice);
  const matched = activeSchoolInvoices.filter((invoice) => invoiceMatchesAcademicPeriod(invoice, period));
  const nearMisses = activeSchoolInvoices
    .filter((invoice) => !invoiceMatchesAcademicPeriod(invoice, period))
    .map((invoice) => ({
      id: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number || invoice.id),
      status: String(invoice.status || 'pending'),
      reasons: explainInvoiceMismatch(invoice, period),
      editHref: buildSchoolReportInvoiceEditHref(String(invoice.id)),
    }))
    .slice(0, 8);

  const hints: string[] = [];
  if (!matched.length) {
    hints.push(
      `Create the report for the correct school + academic term (from academic_terms, not guessed dates).`,
    );
    hints.push(
      `Create the invoice in Finance Center for that same school and term before you publish.`,
    );
    if (nearMisses.some((row) => row.reasons.some((r) => r.includes('old or manual')))) {
      hints.push('Open the near-miss invoice in Finance Center and set term_number + period_label, then refresh snapshot.');
    }
    if (nearMisses.some((row) => row.reasons.some((r) => r.includes('individual/parent')))) {
      hints.push('Parent/individual invoices never attach — use the legacy school invoice builder (stream=school).');
    }
    if (nearMisses.length && !activeSchoolInvoices.length) {
      hints.push('No active school invoices found for this partner — only cancelled or non-school streams exist.');
    }
    if (!nearMisses.length && !activeSchoolInvoices.length) {
      hints.push('No school invoices exist for this partner yet — use Create invoice in Finance Center.');
    }
    hints.push('After saving the invoice, click Refresh snapshot on this report.');
  }

  return {
    reportPeriod: period,
    candidateCount: activeSchoolInvoices.length,
    hints,
    nearMisses,
  };
}
