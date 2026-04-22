/**
 * SCHOOL stream — pdfmake document definition.
 * For partner schools (B2B).
 *
 * Accent colour: indigo (brand "school" colour).
 *
 * What makes this template different from the individual one:
 *   • Includes the Term / Billing Cycle label.
 *   • Includes an explicit commission vs settlement breakdown so
 *     the school can reconcile what Rillcod retained vs what will
 *     be (or was) settled back to the school.
 *   • Headers the document as "PAYMENT CONFIRMATION" rather than
 *     "Official Receipt" — it's an inter-organisational artefact.
 */
import { ReceiptTemplateInput } from './types';
import { formatMoney, formatLongDate } from '../formatters';

export function buildSchoolReceiptDocDef(input: ReceiptTemplateInput) {
  const money = (n: number) => formatMoney(n, input.currency);
  const m = input.meta || {};
  const hasSplit = typeof m.rillcodRetain === 'number' && typeof m.schoolSettlement === 'number';

  return {
    pageMargins: [40, 50, 40, 50] as [number, number, number, number],
    content: [
      {
        columns: [
          {
            stack: [
              { text: 'RILLCOD TECHNOLOGIES', style: 'brand' },
              { text: 'School Partnerships Division', style: 'tagline' },
              { text: '12 Digital Learning Hub, Benin City, Edo State, Nigeria', style: 'address' },
              { text: 'RC: 1892341 · partners@rillcod.com', style: 'address' },
            ],
          },
          {
            alignment: 'right',
            stack: [
              { text: 'PAYMENT CONFIRMATION', style: 'docType' },
              { text: 'SCHOOL BILLING CYCLE', style: 'streamTag' },
              { text: ' ', margin: [0, 4] },
              { text: input.receiptNumber, style: 'docNumber' },
              { text: `Ref: ${input.transactionReference}`, style: 'ref' },
              { text: formatLongDate(input.paidAt), style: 'date' },
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 1.4, lineColor: '#4f46e5' }] },
      { text: '\n' },

      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'PARTNER SCHOOL', style: 'label' },
              { text: input.payer.schoolName || input.payer.name, style: 'payerName' },
              input.payer.email ? { text: input.payer.email, style: 'payerMeta' } : {},
              input.payer.address ? { text: input.payer.address, style: 'payerMeta' } : {},
              input.payer.term ? { text: `Cycle: ${input.payer.term}`, style: 'payerMeta', margin: [0, 6, 0, 0] } : {},
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: 'CYCLE SUMMARY', style: 'label', alignment: 'right' },
              { text: (input.paymentMethod || 'transfer').replace('_', ' ').toUpperCase(), alignment: 'right', style: 'payerMeta' },
              m.invoiceNumber ? { text: `Invoice ${m.invoiceNumber}`, alignment: 'right', style: 'payerMeta' } : {},
              typeof m.studentCount === 'number'
                ? { text: `${m.studentCount} student${m.studentCount === 1 ? '' : 's'}`, alignment: 'right', style: 'payerMeta' }
                : {},
              { text: 'STATUS: RECEIVED', alignment: 'right', color: '#4338ca', bold: true, fontSize: 10, margin: [0, 4, 0, 0] },
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
              { text: 'LINE ITEM', style: 'th' },
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

      // ── Commission / settlement breakdown (school-only) ──
      hasSplit
        ? {
            style: 'split',
            table: {
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'GROSS CYCLE AMOUNT', style: 'splitLabel' },
                  { text: money(input.amount), alignment: 'right', bold: true },
                ],
                [
                  { text: `Rillcod commission (${m.commissionRate ?? 15}%)`, style: 'splitLabel' },
                  { text: `– ${money(m.rillcodRetain!)}`, alignment: 'right', color: '#b91c1c' },
                ],
                [
                  { text: 'SETTLEMENT TO SCHOOL', style: 'splitTotalLabel' },
                  { text: money(m.schoolSettlement!), alignment: 'right', bold: true, color: '#4338ca', fontSize: 13 },
                ],
                m.settlementReference
                  ? [
                      { text: 'Settlement reference', style: 'splitLabel' },
                      { text: m.settlementReference, alignment: 'right', style: 'payerMeta' },
                    ]
                  : ['', ''],
              ],
            },
            layout: {
              hLineWidth: (i: number, node: any) =>
                i === 0 || i === node.table.body.length || i === node.table.body.length - 2 ? 1 : 0.4,
              vLineWidth: () => 0,
              hLineColor: () => '#c7d2fe',
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          }
        : {
            columns: [
              { text: '', width: '*' },
              {
                width: 220,
                stack: [
                  {
                    columns: [
                      { text: 'CYCLE TOTAL', bold: true, fontSize: 13, color: '#0f172a' },
                      { text: money(input.amount), alignment: 'right', bold: true, fontSize: 14, color: '#4338ca' },
                    ],
                  },
                ],
              },
            ],
          },

      input.notes
        ? { text: input.notes, margin: [0, 24, 0, 0], style: 'notes' }
        : {},

      { text: '\n\n' },
      {
        text: 'This document confirms receipt of the partner-school billing cycle payment.',
        style: 'footer',
        alignment: 'center',
      },
      { text: `${input.receiptNumber} · system-generated`, style: 'footerMeta', alignment: 'center' },
    ],
    styles: {
      brand: { fontSize: 18, bold: true, color: '#4338ca' },
      tagline: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 2, 0, 8] },
      address: { fontSize: 9, color: '#64748b' },
      docType: { fontSize: 18, bold: true, color: '#0f172a' },
      streamTag: { fontSize: 8, bold: true, color: '#4338ca', margin: [0, 2, 0, 0] },
      docNumber: { fontSize: 11, bold: true, color: '#334155' },
      ref: { fontSize: 9, color: '#64748b' },
      date: { fontSize: 9, color: '#64748b' },
      label: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 0, 0, 4] },
      payerName: { fontSize: 12, bold: true, color: '#0f172a' },
      payerMeta: { fontSize: 10, color: '#475569' },
      th: { fontSize: 9, bold: true, color: '#334155', fillColor: '#eef2ff', margin: [0, 6, 0, 6] },
      split: { margin: [0, 12, 0, 12], fillColor: '#f8fafc' },
      splitLabel: { fontSize: 10, color: '#475569', margin: [6, 6, 0, 6] },
      splitTotalLabel: { fontSize: 11, bold: true, color: '#0f172a', margin: [6, 8, 0, 8] },
      notes: { fontSize: 10, italics: true, color: '#64748b' },
      footer: { fontSize: 10, color: '#334155', italics: true },
      footerMeta: { fontSize: 8, color: '#94a3b8', margin: [0, 4, 0, 0] },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0f172a' },
  };
}
