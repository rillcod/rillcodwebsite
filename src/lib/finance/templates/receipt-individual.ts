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

  return {
    pageMargins: [40, 50, 40, 50] as [number, number, number, number],
    content: [
      {
        columns: [
          {
            stack: [
              { text: 'RILLCOD ACADEMY', style: 'brand' },
              { text: 'STEM & Coding Education', style: 'tagline' },
              { text: '12 Digital Learning Hub, Benin City, Edo State, Nigeria', style: 'address' },
              { text: 'www.rillcod.com · support@rillcod.com', style: 'address' },
            ],
          },
          {
            alignment: 'right',
            stack: [
              { text: 'OFFICIAL RECEIPT', style: 'docType' },
              { text: 'LEARNER PAYMENT', style: 'streamTag' },
              { text: ' ', margin: [0, 4] },
              { text: input.receiptNumber, style: 'docNumber' },
              { text: `Ref: ${input.transactionReference}`, style: 'ref' },
              { text: formatLongDate(input.paidAt), style: 'date' },
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 1.4, lineColor: '#10b981' }] },
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
              { text: 'STATUS: PAID', alignment: 'right', color: '#047857', bold: true, fontSize: 10, margin: [0, 4, 0, 0] },
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
            width: 220,
            stack: [
              {
                columns: [
                  { text: 'TOTAL PAID', bold: true, fontSize: 13, color: '#0f172a' },
                  { text: money(input.amount), alignment: 'right', bold: true, fontSize: 14, color: '#047857' },
                ],
              },
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
      brand: { fontSize: 18, bold: true, color: '#047857' },
      tagline: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 2, 0, 8] },
      address: { fontSize: 9, color: '#64748b' },
      docType: { fontSize: 20, bold: true, color: '#0f172a' },
      streamTag: { fontSize: 8, bold: true, color: '#047857', margin: [0, 2, 0, 0] },
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
