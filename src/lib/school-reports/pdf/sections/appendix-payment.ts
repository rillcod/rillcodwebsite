import { appendixHeaderCells, appendixHero, printableAppendixTable } from '../appendix';
import { appendixSectionStack } from '../blocks';
import { formatMoney } from '../text';
import { APPENDIX_D_ACCENT, APPENDIX_ROSTER_TINT, INK } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Appendix D — payment confirmation.
 *
 * Only appears when money has actually been received: a payment schedule with
 * no payments on it reads as a demand rather than a receipt, which is the wrong
 * thing to hand a school that has not been billed yet.
 */
export function buildAppendixPaymentSection(ctx: SchoolReportPdfContext): object[] {
  const { snapshot, reportPolicy } = ctx;
  if (!ctx.showSec('appendixPayment') || snapshot.finance.totalPaid <= 0) return [];

  const money = (value: number) => formatMoney(value, snapshot.finance.currency, reportPolicy.finance.locale);
  const paidInvoices = snapshot.finance.invoices.filter((row) => row.paid > 0);

  return [
    appendixSectionStack(
      appendixHero({
        letter: 'D',
        title: 'Payment confirmation',
        subtitle: `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — printable payment schedule for reconciliation. Keep with your bank receipt.`,
        accent: APPENDIX_D_ACCENT,
        chips: [
          { label: 'Paid', value: money(snapshot.finance.totalPaid) },
          { label: 'Invoices', value: String(paidInvoices.length) },
          { label: 'Outstanding', value: money(snapshot.finance.totalOutstanding) },
        ],
      }),
      printableAppendixTable(
        [
          appendixHeaderCells(['Invoice', 'Payment recorded', 'Balance', 'Status']),
          ...paidInvoices.map((row) => [
            { text: row.invoiceNumber, bold: true, fontSize: 7, color: INK },
            { text: money(row.paid), fontSize: 7, color: INK, alignment: 'right' as const },
            { text: money(row.outstanding), fontSize: 7, color: INK, alignment: 'right' as const },
            { text: row.status || (row.outstanding > 0 ? 'Part paid' : 'Paid'), fontSize: 7, color: INK },
          ]),
        ],
        ['*', 82, 82, 70],
        APPENDIX_ROSTER_TINT,
      ),
    ),
  ];
}
