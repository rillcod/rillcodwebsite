/**
 * Consolidated payment STATEMENT — pdfmake document definition.
 * Summarises every payment made for a student over a period. Useful for tax
 * receipts, school records and parent peace of mind.
 */
import { formatMoney, formatLongDate } from '../formatters';

export interface StatementLine {
  date: string | null;
  description: string;
  method: string | null;
  reference: string | null;
  amount: number;
  status: string | null;
}

export interface StatementInput {
  studentName: string;
  payerName?: string | null;
  payerEmail?: string | null;
  schoolName?: string | null;
  currency: string;
  lines: StatementLine[];
  totalPaid: number;
  generatedAt: string;
  statementRef: string;
}

export function buildStatementDocDef(input: StatementInput) {
  const money = (n: number) => formatMoney(n, input.currency);

  return {
    pageMargins: [40, 40, 40, 50] as [number, number, number, number],
    content: [
      // ── Branded header band ──
      {
        table: {
          widths: ['*', 'auto'],
          body: [[
            {
              stack: [
                { text: 'RILLCOD ACADEMY', style: 'brand' },
                { text: 'STEM & Coding Education', style: 'tagline' },
              ],
              fillColor: '#0f172a',
              margin: [16, 18, 0, 18],
            },
            {
              stack: [
                { text: 'PAYMENT STATEMENT', style: 'docType' },
                { text: 'CONSOLIDATED HISTORY', style: 'streamTag' },
              ],
              fillColor: '#0f172a',
              alignment: 'right',
              margin: [0, 20, 16, 18],
            },
          ]],
        },
        layout: 'noBorders',
      },
      { canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 4, color: '#10b981' }] },
      { text: '\n' },

      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'STUDENT', style: 'label' },
              { text: input.studentName, style: 'payerName' },
              input.schoolName ? { text: input.schoolName, style: 'payerMeta' } : {},
              input.payerName ? { text: `Parent/Guardian: ${input.payerName}`, style: 'payerMeta' } : {},
              input.payerEmail ? { text: input.payerEmail, style: 'payerMeta' } : {},
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: 'STATEMENT', style: 'label', alignment: 'right' },
              { text: input.statementRef, style: 'docNumber', alignment: 'right' },
              { text: `Generated ${formatLongDate(input.generatedAt)}`, style: 'date', alignment: 'right' },
              { text: `${input.lines.length} payment${input.lines.length === 1 ? '' : 's'}`, style: 'date', alignment: 'right' },
            ],
          },
        ],
      },
      { text: '\n' },

      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto', 'auto'],
          body: [
            [
              { text: 'DATE', style: 'th' },
              { text: 'DESCRIPTION', style: 'th' },
              { text: 'METHOD', style: 'th' },
              { text: 'AMOUNT', style: 'th', alignment: 'right' },
            ],
            ...input.lines.map((l) => [
              { text: l.date ? formatLongDate(l.date) : '—', margin: [0, 6, 0, 6], fontSize: 9 },
              { text: `${l.description}${l.reference ? `\nRef: ${l.reference}` : ''}`, margin: [0, 6, 0, 6], fontSize: 9 },
              { text: (l.method || 'online').replace(/_/g, ' ').toUpperCase(), margin: [0, 6, 0, 6], fontSize: 8 },
              { text: money(l.amount), alignment: 'right', bold: true, margin: [0, 6, 0, 6], fontSize: 9 },
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
            stack: [{
              table: {
                widths: ['*', 'auto'],
                body: [[
                  { text: 'TOTAL PAID', bold: true, fontSize: 11, color: '#064e3b', margin: [10, 8, 0, 8], fillColor: '#ecfdf5' },
                  { text: money(input.totalPaid), alignment: 'right', bold: true, fontSize: 14, color: '#047857', margin: [0, 8, 10, 8], fillColor: '#ecfdf5' },
                ]],
              },
              layout: { hLineWidth: () => 1, vLineWidth: () => 0, hLineColor: () => '#10b981' },
            }],
          },
        ],
      },

      { text: '\n\n' },
      { text: 'This statement summarises all confirmed payments on record. Keep it for your records.', style: 'footer', alignment: 'center' },
      { text: `${input.statementRef} · system-generated`, style: 'footerMeta', alignment: 'center' },
    ],
    styles: {
      brand: { fontSize: 18, bold: true, color: '#ffffff' },
      tagline: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 3, 0, 0] },
      docType: { fontSize: 18, bold: true, color: '#ffffff' },
      streamTag: { fontSize: 8, bold: true, color: '#6ee7b7', margin: [0, 3, 0, 0] },
      docNumber: { fontSize: 11, bold: true, color: '#334155' },
      date: { fontSize: 9, color: '#64748b' },
      label: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 0, 0, 4] },
      payerName: { fontSize: 12, bold: true, color: '#0f172a' },
      payerMeta: { fontSize: 10, color: '#475569' },
      th: { fontSize: 9, bold: true, color: '#334155', fillColor: '#f1f5f9', margin: [0, 6, 0, 6] },
      footer: { fontSize: 10, color: '#334155', italics: true },
      footerMeta: { fontSize: 8, color: '#94a3b8', margin: [0, 4, 0, 0] },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0f172a' },
  };
}
