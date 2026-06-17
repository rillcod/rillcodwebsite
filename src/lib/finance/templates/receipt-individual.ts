/**
 * INDIVIDUAL stream — pdfmake document definition.
 * For direct learners & parents.
 *
 * Accent colour: emerald (brand "paid" colour).
 * Core fields: learner name, course / invoice, amount received,
 * payment method.  No commission or settlement sections — the
 * learner does not need to see Rillcod's internal split.
 */
import { ReceiptTemplateInput } from './types';
import { formatMoney, formatLongDate } from '../formatters';

export function buildIndividualReceiptDocDef(input: ReceiptTemplateInput) {
  const money = (n: number) => formatMoney(n, input.currency);

  const statusText = input.meta?.isPartPayment ? 'PART PAYMENT' : input.meta?.isBalancePayment ? 'BALANCE PAID' : 'PAID';
  const statusFill = input.meta?.isPartPayment ? '#f59e0b' : '#10b981';

  return {
    pageMargins: [40, 40, 40, 50] as [number, number, number, number],
    content: [
      // ── Branded header band (sits within page margins) ──
      {
        table: {
          widths: ['*', 'auto'],
          body: [[
            {
              stack: [
                { text: 'RILLCOD ACADEMY', style: 'brand' },
                { text: 'STEM & Coding Education', style: 'tagline' },
              ],
              fillColor: '#064e3b',
              margin: [16, 18, 0, 18],
            },
            {
              stack: [
                { text: 'OFFICIAL RECEIPT', style: 'docType' },
                { text: 'LEARNER PAYMENT', style: 'streamTag' },
              ],
              fillColor: '#064e3b',
              alignment: 'right',
              margin: [0, 20, 16, 18],
            },
          ]],
        },
        layout: 'noBorders',
      },
      // Accent strip under the band
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 4, color: '#10b981' }] },
      { text: '\n' },

      // ── Meta row: address + PAID badge / receipt no / ref / date ──
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: '12 Digital Learning Hub, Benin City, Edo State, Nigeria', style: 'address' },
              { text: 'www.rillcod.com · support@rillcod.com', style: 'address' },
            ],
          },
          {
            width: 'auto',
            stack: [
              {
                table: { body: [[{ text: statusText, color: '#ffffff', bold: true, fontSize: 10, fillColor: statusFill, margin: [10, 4, 10, 4] }]] },
                layout: 'noBorders',
                alignment: 'right',
              },
              { text: input.receiptNumber, style: 'docNumber', alignment: 'right', margin: [0, 6, 0, 0] },
              { text: `Ref: ${input.transactionReference}`, style: 'ref', alignment: 'right' },
              { text: formatLongDate(input.paidAt), style: 'date', alignment: 'right' },
            ],
          },
        ],
      },
      { text: '\n' },

      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'RECEIVED FROM', style: 'label' },
              { text: input.payer.name, style: 'payerName' },
              input.payer.email ? { text: input.payer.email, style: 'payerMeta' } : {},
              input.meta?.courseTitle ? { text: input.meta.courseTitle, style: 'payerMeta' } : {},
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: 'PAYMENT DETAILS', style: 'label', alignment: 'right' },
              { text: (input.paymentMethod || 'online').replace('_', ' ').toUpperCase(), alignment: 'right', style: 'payerMeta' },
              input.meta?.invoiceNumber ? { text: `Invoice ${input.meta.invoiceNumber}`, alignment: 'right', style: 'payerMeta' } : {},
              input.meta?.isPartPayment
                ? { text: 'STATUS: PART PAYMENT', alignment: 'right', color: '#b45309', bold: true, fontSize: 10, margin: [0, 4, 0, 0] }
                : input.meta?.isBalancePayment
                  ? { text: 'STATUS: BALANCE PAID', alignment: 'right', color: '#047857', bold: true, fontSize: 10, margin: [0, 4, 0, 0] }
                  : { text: 'STATUS: PAID', alignment: 'right', color: '#047857', bold: true, fontSize: 10, margin: [0, 4, 0, 0] },
            ],
          },
        ],
      },
      { text: '\n' },

      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'DESCRIPTION', style: 'th' },
              { text: 'QTY', style: 'th', alignment: 'center' },
              { text: 'UNIT', style: 'th', alignment: 'right' },
              { text: 'AMOUNT', style: 'th', alignment: 'right' },
            ],
            ...input.items.map((it) => [
              { text: it.description, margin: [0, 6, 0, 6] },
              { text: String(it.quantity ?? 1), alignment: 'center', margin: [0, 6, 0, 6] },
              { text: money(it.unit_price ?? it.total), alignment: 'right', margin: [0, 6, 0, 6] },
              { text: money(it.total), alignment: 'right', bold: true, margin: [0, 6, 0, 6] },
            ]),
          ],
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 1 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => '#e2e8f0',
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      },

      { text: '\n' },
      {
        columns: [
          { text: '', width: '*' },
          {
            width: 240,
            stack: [
              {
                table: {
                  widths: ['*', 'auto'],
                  body: [[
                    { text: input.meta?.isPartPayment ? 'AMOUNT PAID (DEPOSIT)' : input.meta?.isBalancePayment ? 'BALANCE PAID' : 'TOTAL PAID', bold: true, fontSize: 11, color: '#064e3b', margin: [10, 8, 0, 8], fillColor: '#ecfdf5' },
                    { text: money(input.amount), alignment: 'right', bold: true, fontSize: 14, color: input.meta?.isPartPayment ? '#b45309' : '#047857', margin: [0, 8, 10, 8], fillColor: '#ecfdf5' },
                  ]],
                },
                layout: {
                  hLineWidth: () => 1, vLineWidth: () => 0,
                  hLineColor: () => (input.meta?.isPartPayment ? '#f59e0b' : '#10b981'),
                },
              },
              input.meta?.isPartPayment
                ? {
                    text: 'This is a 50% deposit payment. The remaining balance is due by week 3.',
                    color: '#b45309',
                    italics: true,
                    fontSize: 8.5,
                    margin: [0, 6, 0, 0],
                    alignment: 'right',
                  }
                : input.meta?.isBalancePayment
                  ? {
                      text: 'Remaining tuition balance is now fully settled.',
                      color: '#047857',
                      italics: true,
                      fontSize: 8.5,
                      margin: [0, 6, 0, 0],
                      alignment: 'right',
                    }
                  : {}
            ],
          },
        ],
      },

      input.notes
        ? {
            text: input.notes,
            margin: [0, 24, 0, 0],
            style: 'notes',
          }
        : {},

      { text: '\n\n' },
      { text: 'Thank you for learning with Rillcod. Keep this receipt for your records.', style: 'footer', alignment: 'center' },
      { text: `${input.receiptNumber} · system-generated`, style: 'footerMeta', alignment: 'center' },
    ],
    styles: {
      brand: { fontSize: 18, bold: true, color: '#ffffff' },
      tagline: { fontSize: 8, bold: true, color: '#6ee7b7', margin: [0, 3, 0, 0] },
      address: { fontSize: 9, color: '#64748b' },
      docType: { fontSize: 18, bold: true, color: '#ffffff' },
      streamTag: { fontSize: 8, bold: true, color: '#6ee7b7', margin: [0, 3, 0, 0] },
      docNumber: { fontSize: 11, bold: true, color: '#334155' },
      ref: { fontSize: 9, color: '#64748b' },
      date: { fontSize: 9, color: '#64748b' },
      label: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 0, 0, 4] },
      payerName: { fontSize: 12, bold: true, color: '#0f172a' },
      payerMeta: { fontSize: 10, color: '#475569' },
      th: { fontSize: 9, bold: true, color: '#334155', fillColor: '#ecfdf5', margin: [0, 6, 0, 6] },
      notes: { fontSize: 10, italics: true, color: '#64748b' },
      footer: { fontSize: 10, color: '#334155', italics: true },
      footerMeta: { fontSize: 8, color: '#94a3b8', margin: [0, 4, 0, 0] },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0f172a' },
  };
}
