import type { SchoolReportPaymentAccount } from '../../payment-accounts';
import type { SchoolReportPolicy } from '../../report-policy';
import { appendixHeaderCells, appendixHero, printableAppendixTable } from '../appendix';
import { appendixSectionStack } from '../blocks';
import { formatMoney, plainStatus } from '../text';
import { APPENDIX_B_ACCENT, APPENDIX_ROSTER_TINT, BRAND, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Appendix B — school invoice and payment instructions.
 *
 * paymentAccountsBlock lives here rather than with the shared primitives: it is
 * used by this section alone, and its no-accounts branch is a deliberate
 * fallback (point the school at WhatsApp) rather than a generic empty state.
 */
function paymentAccountsBlock(accounts: SchoolReportPaymentAccount[], policy: SchoolReportPolicy) {
  if (!accounts.length) {
    return {
      stack: [
        { text: 'Payment instructions', style: 'subsection' },
        {
          text: `Bank transfer details are not included here. Please contact ${policy.payment.whatsappDisplay} and quote your invoice number.`,
          color: MUTED,
          fontSize: 8,
          lineHeight: 1.35,
        },
      ],
      margin: [0, 4, 0, 8] as [number, number, number, number],
    };
  }

  return {
    stack: [
      { text: 'Payment instructions - bank transfer', style: 'subsection' },
      {
        text: `Quote your invoice number as the payment reference. Use the account below, then send the receipt by WhatsApp to the official line: ${policy.payment.whatsappDisplay}.`,
        color: MUTED,
        fontSize: 7.5,
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        table: {
          widths: ['*'],
          // Exactly one account is printed: offering a school a choice of
          // destinations on a payment slip invites reconciliation errors.
          body: accounts.slice(0, 1).map((acct) => [
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { text: acct.label || 'Rillcod account', fontSize: 8, bold: true, color: BRAND },
                    { text: acct.bankName, fontSize: 7.5, color: MUTED },
                    ...(acct.paymentNote
                      ? [{ text: acct.paymentNote, fontSize: 7, color: MUTED, italics: true, margin: [0, 2, 0, 0] as [number, number, number, number] }]
                      : []),
                  ],
                },
                {
                  width: 'auto',
                  stack: [
                    { text: 'ACCOUNT NUMBER', fontSize: 6.5, bold: true, color: MUTED, alignment: 'right' as const },
                    {
                      text: acct.accountNumber,
                      fontSize: 12,
                      bold: true,
                      alignment: 'right' as const,
                      characterSpacing: 1,
                      margin: [0, 2, 0, 2] as [number, number, number, number],
                    },
                    { text: acct.accountName, fontSize: 7.5, alignment: 'right' as const },
                  ],
                },
              ],
              margin: [10, 8, 10, 8] as [number, number, number, number],
            },
          ]),
        },
        layout: {
          fillColor: () => '#faf5ff',
          hLineColor: () => '#e9d5ff',
          vLineColor: () => '#e9d5ff',
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 6, 0, 8] as [number, number, number, number],
  };
}

export function buildAppendixFinanceSection(ctx: SchoolReportPdfContext): object[] {
  const { showSec, snapshot, reportPolicy } = ctx;
  if (!showSec('finance')) return [];

  const money = (value: number) => formatMoney(value, snapshot.finance.currency, reportPolicy.finance.locale);
  const paymentAccounts = snapshot.finance.paymentAccounts || [];

  const invoiceRows = snapshot.finance.invoices.length
    ? snapshot.finance.invoices.map((invoice) => [
        { text: invoice.invoiceNumber, fontSize: 8 },
        { text: plainStatus(invoice.status), fontSize: 7.5 },
        { text: money(invoice.amount), fontSize: 8, alignment: 'right' },
        { text: money(invoice.paid), fontSize: 8, alignment: 'right' },
        { text: money(invoice.outstanding), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'Invoice for this term will be issued separately.', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  return [
    {
      stack: [
        appendixSectionStack(
          appendixHero({
            letter: 'B',
            title: 'School invoice',
            subtitle: snapshot.finance.attached
              ? `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — term invoice summary.`
              : `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — invoice details to follow.`,
            accent: APPENDIX_B_ACCENT,
            chips: [
              { label: 'Invoiced', value: money(snapshot.finance.totalInvoiced) },
              { label: 'Paid', value: money(snapshot.finance.totalPaid) },
              { label: 'Outstanding', value: money(snapshot.finance.totalOutstanding) },
            ],
          }),
          printableAppendixTable(
            [appendixHeaderCells(['Invoice', 'Status', 'Amount', 'Paid', 'Balance']), ...invoiceRows],
            ['*', 70, 70, 66, 66],
            APPENDIX_ROSTER_TINT,
          ),
        ),
        // Says so explicitly rather than leaving the reader to infer it from an
        // empty table.
        ...(snapshot.finance.attached
          ? []
          : [{
              text: 'Term invoice is not included in this edition.',
              color: MUTED,
              fontSize: 7,
              margin: [0, 0, 0, 4] as [number, number, number, number],
            }]),
        paymentAccountsBlock(paymentAccounts, reportPolicy),
      ],
      margin: [0, 0, 0, 4],
    },
  ];
}
