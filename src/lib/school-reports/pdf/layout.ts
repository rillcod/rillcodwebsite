import { briefExecutiveItems, toTitleCase, withMinPresence } from './text';
import {
  BORDER,
  BRAND,
  HEADER_BG,
  INK,
  MUTED,
  PAGE_WIDTH_CONTENT,
  PDF_MIN_PANEL,
  PDF_MIN_TABLE,
  RULE,
} from './tokens';

/**
 * Table, panel and metric layout primitives for the report book.
 *
 * `tableLayout`, `headerCells` and `flowingDataTable` are deliberately kept in
 * one module: flowingDataTable calls the other two, so splitting them across
 * files would have forced an import cycle back into the document builder.
 */

export function tableLayout() {
  return {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? HEADER_BG : rowIndex % 2 ? '#ffffff' : '#f9fafb'),
    hLineColor: () => BORDER,
    vLineColor: () => BORDER,
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  };
}

export function headerCells(labels: string[]) {
  return labels.map((text) => ({ text, style: 'tableHeader' }));
}

/** Table that can flow across pages but won't start unless the header fits comfortably. */
export function flowingDataTable(
  headers: string[],
  rows: object[][],
  widths: (string | number)[],
  opts?: { compact?: boolean; layout?: ReturnType<typeof tableLayout>; margin?: [number, number, number, number] },
) {
  const body = rows.length
    ? [headerCells(headers), ...rows]
    : [[{ text: 'No records for this section.', colSpan: headers.length, color: MUTED, italics: true, fontSize: 8 }, ...Array(Math.max(0, headers.length - 1)).fill({})]];
  return withMinPresence(
    {
      table: {
        headerRows: 1,
        dontBreakRows: opts?.compact ?? false,
        widths,
        body,
      },
      layout: opts?.layout ?? tableLayout(),
      margin: opts?.margin ?? ([0, 0, 0, 4] as [number, number, number, number]),
    },
    opts?.compact ? 36 : PDF_MIN_TABLE,
  );
}

export function compactMetric(label: string, value: string, note: string, color = BRAND) {
  return {
    stack: [
      { text: toTitleCase(label), color: MUTED, fontSize: 6.5, bold: true },
      { text: value, color, fontSize: 13, bold: true, margin: [0, 2, 0, 1] },
      { text: note, color: MUTED, fontSize: 7.5, lineHeight: 1.2 },
    ],
  };
}

export function progressBar(label: string, value: number, color: string) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return {
    stack: [
      {
        columns: [
          { text: label, bold: true, fontSize: 8, color: INK },
          { text: `${safe}%`, alignment: 'right', bold: true, color, fontSize: 8 },
        ],
      },
      {
        margin: [0, 3, 0, 2],
        table: {
          widths: [`${safe}%`, `${100 - safe}%`],
          body: [
            [
              { text: '', fillColor: color, margin: [0, 2.5, 0, 2.5], border: [false, false, false, false] },
              { text: '', fillColor: '#e5e7eb', margin: [0, 2.5, 0, 2.5], border: [false, false, false, false] },
            ],
          ],
        },
        layout: 'noBorders',
      },
    ],
  };
}

export function panelBorderLayout(accent = BRAND) {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 ? 2 : i === node.table.body.length ? 1 : 0,
    vLineWidth: () => 1,
    hLineColor: (i: number) => (i === 0 ? accent : BORDER),
    vLineColor: () => BORDER,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

/** Bordered segment panel for PDF - matches UI SegmentPanel with accent top rule. */
export function borderedSegment(title: string, body: object[], accent = BRAND, fillColor = '#fafafa') {
  return withMinPresence(
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [{ text: toTitleCase(title), style: 'subsection', color: accent, margin: [0, 0, 0, 4] }, ...body],
              fillColor,
              margin: [10, 6, 10, 7],
            },
          ],
        ],
      },
      layout: panelBorderLayout(accent),
      margin: [0, 0, 0, 5] as [number, number, number, number],
    },
    PDF_MIN_PANEL,
  );
}

/** Side-by-side segment columns with equal weight. */
export function pairedSegmentColumns(left: object, right: object, gap = 14) {
  return withMinPresence(
    {
      columns: [
        { width: '*', ...left },
        { width: gap, text: '' },
        { width: '*', ...right },
      ],
      columnGap: 0,
      margin: [0, 0, 0, 5] as [number, number, number, number],
    },
    PDF_MIN_PANEL,
  );
}

export function numberedRecommendationCards(items: string[], maxItems = 4) {
  const recommendations = briefExecutiveItems(items, maxItems, 150);
  if (!recommendations.length) {
    return { text: 'No student recommendations recorded.', color: MUTED, italics: true, fontSize: 8 };
  }
  return withMinPresence(
    {
      table: {
        widths: [30, '*'],
        body: recommendations.map((item, index) => [
          {
            text: String(index + 1).padStart(2, '0'),
            color: '#ffffff',
            fillColor: BRAND,
            bold: true,
            fontSize: 10,
            alignment: 'center',
            margin: [0, 7, 0, 7],
          },
          {
            text: item,
            color: INK,
            fillColor: index % 2 === 0 ? '#f9fafb' : '#fff7f7',
            fontSize: 8.5,
            lineHeight: 1.3,
            margin: [9, 6, 8, 6],
          },
        ]),
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => BORDER,
        vLineColor: () => BORDER,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    },
    PDF_MIN_TABLE,
  );
}

export function brandAccentRule() {
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: PAGE_WIDTH_CONTENT, h: 2.5, color: BRAND, lineWidth: 0 },
      { type: 'rect', x: 0, y: 2.5, w: PAGE_WIDTH_CONTENT, h: 0.75, color: RULE, lineWidth: 0 },
    ],
    margin: [0, 0, 0, 6],
  };
}

export function borderedPanelLayout(fillColor = '#f9fafb') {
  return {
    fillColor: () => fillColor,
    hLineColor: () => BORDER,
    vLineColor: () => BORDER,
    paddingLeft: () => 10,
    paddingRight: () => 10,
    paddingTop: () => 8,
    paddingBottom: () => 8,
  };
}
