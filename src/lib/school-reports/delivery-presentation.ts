import type { DeliveryLedger, DeliveryTopicRow } from './delivery-structure';
import { formatCourseDisplay, formatProgrammeDisplay } from './display-labels';
import { NEXT_TERM_FOCUS_LABEL } from './report-content-dedup';
import { buildNextLinesPdfCallout } from './topics-covered-presentation';

export type DeliveryPdfColors = {
  ink: string;
  brand: string;
  muted: string;
  emerald?: string;
};

export type DeliveryReflection = {
  summary?: string;
  nextIntro?: string;
};

function cardBorderLayout(borderColor = '#e5e7eb') {
  return {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => borderColor,
    vLineColor: () => borderColor,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function panelBorderLayout(accent: string) {
  return {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
      i === 0 ? 2 : i === node.table.body.length ? 1 : 0,
    vLineWidth: () => 1,
    hLineColor: (i: number) => (i === 0 ? accent : '#e5e7eb'),
    vLineColor: () => '#e5e7eb',
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function deliveryTableLayout() {
  const border = '#e5e7eb';
  const header = '#1f2937';
  return {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? header : rowIndex % 2 ? '#ffffff' : '#f9fafb'),
    hLineColor: () => border,
    vLineColor: () => border,
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  };
}

function wrapText(
  value: unknown,
  opts?: { fontSize?: number; bold?: boolean; color?: string; lineHeight?: number; maxChars?: number },
) {
  let text = String(value ?? '').trim();
  if (opts?.maxChars && text.length > opts.maxChars) {
    const slice = text.slice(0, opts.maxChars);
    const lastSpace = slice.lastIndexOf(' ');
    text = `${(lastSpace > opts.maxChars * 0.55 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
  }
  return {
    text,
    fontSize: opts?.fontSize ?? 7.5,
    bold: opts?.bold,
    color: opts?.color,
    lineHeight: opts?.lineHeight ?? 1.25,
  };
}

function sourceTagLabel(source: DeliveryTopicRow['source']): string {
  if (source === 'both') return 'Curriculum + results';
  if (source === 'curriculum') return 'Weeks logged';
  return 'Results path';
}

function buildSourceTag(source: DeliveryTopicRow['source'], colors: DeliveryPdfColors) {
  return {
    text: sourceTagLabel(source).toUpperCase(),
    fontSize: 6.25,
    bold: true,
    color: colors.muted,
    characterSpacing: 0.35,
    margin: [0, 4, 0, 0] as [number, number, number, number],
  };
}

function buildSubsectionPanel(title: string, body: object[], accent: string, fillColor = '#fafafa') {
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: title, style: 'subsection', color: accent, margin: [0, 0, 0, 4] as [number, number, number, number] },
          ...body,
        ],
        fillColor,
        margin: [10, 6, 10, 7] as [number, number, number, number],
      }]],
    },
    layout: panelBorderLayout(accent),
    margin: [0, 0, 0, 5] as [number, number, number, number],
  };
}

function buildDeliveryTopicCard(
  row: DeliveryTopicRow,
  colors: DeliveryPdfColors,
  reflection?: DeliveryReflection,
  phaseLabel?: string,
) {
  return {
    table: {
      widths: ['*'],
      body: [[
        {
          stack: [
            {
              canvas: [{ type: 'rect', x: 0, y: 0, w: 240, h: 2.5, color: colors.brand, lineWidth: 0 }],
              margin: [0, 0, 0, 6] as [number, number, number, number],
            },
            wrapText(formatProgrammeDisplay(row.programme), { fontSize: 6.75, bold: true, color: colors.brand, lineHeight: 1.1 }),
            wrapText(formatCourseDisplay(row.course), { fontSize: 9, bold: true, color: colors.ink, lineHeight: 1.15 }),
            ...(phaseLabel
              ? [wrapText(phaseLabel, { fontSize: 6.5, color: colors.brand, lineHeight: 1.1 })]
              : []),
            wrapText(row.weekRange, { fontSize: 7.25, color: colors.muted, lineHeight: 1.2 }),
            wrapText(row.evidence, { fontSize: 7.25, color: colors.muted, lineHeight: 1.25 }),
            ...(reflection?.nextIntro
              ? [wrapText(reflection.nextIntro, { fontSize: 7.25, color: colors.ink, lineHeight: 1.25, maxChars: 220 })]
              : []),
            buildSourceTag(row.source, colors),
          ],
          margin: [9, 4, 9, 9] as [number, number, number, number],
          fillColor: '#ffffff',
        },
      ]],
    },
    layout: cardBorderLayout('#e5e7eb'),
  };
}

function buildDeliveryTopicCardGrid(
  rows: DeliveryTopicRow[],
  colors: DeliveryPdfColors,
  reflectionByKey: Map<string, DeliveryReflection>,
  phaseLabelFor?: (programme: string) => string,
): object[] {
  const blocks: object[] = [];
  for (let index = 0; index < rows.length; index += 2) {
    const pair = rows.slice(index, index + 2);
    blocks.push({
      columns: pair.length === 2
        ? [
            {
              width: '*',
              stack: [buildDeliveryTopicCard(
                pair[0],
                colors,
                reflectionByKey.get(`${pair[0].programme}::${pair[0].course}`),
                phaseLabelFor?.(pair[0].programme),
              )],
            },
            { width: 10, text: '' },
            {
              width: '*',
              stack: [buildDeliveryTopicCard(
                pair[1],
                colors,
                reflectionByKey.get(`${pair[1].programme}::${pair[1].course}`),
                phaseLabelFor?.(pair[1].programme),
              )],
            },
          ]
        : [{
            width: '*',
            stack: [buildDeliveryTopicCard(
              pair[0],
              colors,
              reflectionByKey.get(`${pair[0].programme}::${pair[0].course}`),
              phaseLabelFor?.(pair[0].programme),
            )],
          }],
      margin: [0, 0, 0, 5] as [number, number, number, number],
    });
  }
  return blocks;
}

function buildDeliveryTopicTable(
  rows: DeliveryTopicRow[],
  colors: DeliveryPdfColors,
  reflectionByKey: Map<string, DeliveryReflection>,
  phaseLabelFor?: (programme: string) => string,
) {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: false,
      widths: ['22%', '22%', '20%', '*'],
      body: [
        [
          { text: 'Programme', color: '#ffffff', bold: true, fontSize: 7 },
          { text: 'Course', color: '#ffffff', bold: true, fontSize: 7 },
          { text: 'Delivery range', color: '#ffffff', bold: true, fontSize: 7 },
          { text: 'Evidence & next step', color: '#ffffff', bold: true, fontSize: 7 },
        ],
        ...rows.map((row) => {
          const reflection = reflectionByKey.get(`${row.programme}::${row.course}`);
          const phaseLabel = phaseLabelFor?.(row.programme);
          return [
            {
              stack: [
                wrapText(formatProgrammeDisplay(row.programme), { fontSize: 7.5, bold: true, lineHeight: 1.2 }),
                ...(phaseLabel ? [wrapText(phaseLabel, { fontSize: 6.5, color: colors.brand, lineHeight: 1.1 })] : []),
                buildSourceTag(row.source, colors),
              ],
            },
            wrapText(formatCourseDisplay(row.course), { fontSize: 7.5, lineHeight: 1.2 }),
            wrapText(row.weekRange, { fontSize: 7.5, color: colors.muted, lineHeight: 1.2 }),
            {
              stack: [
                wrapText(row.evidence, { fontSize: 7.25, color: colors.muted, lineHeight: 1.25 }),
                ...(reflection?.nextIntro
                  ? [wrapText(reflection.nextIntro, { fontSize: 7.25, color: colors.ink, lineHeight: 1.25, maxChars: 220 })]
                  : []),
              ],
            },
          ];
        }),
      ],
    },
    layout: deliveryTableLayout(),
    margin: [0, 0, 0, 5] as [number, number, number, number],
  };
}

function buildBulletPanel(title: string, items: string[], accent: string, bulletColor: string) {
  if (!items.length) return null;
  return buildSubsectionPanel(
    title,
    items.map((line) => ({
      columns: [
        { width: 10, text: '•', color: bulletColor, bold: true, fontSize: 9 },
        { width: '*', text: line, fontSize: 8, color: '#111827', lineHeight: 1.35 },
      ],
      margin: [0, 0, 0, 3] as [number, number, number, number],
    })),
    accent,
    accent === '#059669' ? '#f0fdf4' : '#fafafa',
  );
}

/** Structured curriculum delivery section — mirrors DeliveryLedgerView layout. */
export function buildCurriculumDeliveryPdfStack(opts: {
  ledger: DeliveryLedger;
  colors: DeliveryPdfColors;
  programmeScopeText?: string;
  whatWeTaughtBody?: object[];
  showWhatWeTaught?: boolean;
  reflectionByKey?: Map<string, DeliveryReflection>;
  phaseLabelFor?: (programme: string) => string;
}): object[] {
  const {
    ledger,
    colors,
    programmeScopeText,
    whatWeTaughtBody = [],
    showWhatWeTaught = false,
    reflectionByKey = new Map(),
    phaseLabelFor,
  } = opts;

  const stack: object[] = [];

  stack.push(buildSubsectionPanel(
    'Reporting window',
    [
      wrapText(ledger.windowLine, { fontSize: 8.75, bold: true, color: colors.ink, lineHeight: 1.3 }),
      ...(ledger.plannedLines[1] && !programmeScopeText
        ? [wrapText(ledger.plannedLines[1], { fontSize: 7.5, color: colors.muted, lineHeight: 1.25 })]
        : []),
    ],
    colors.brand,
    '#fef2f2',
  ));

  if (programmeScopeText) {
    stack.push({
      table: {
        widths: [118, '*'],
        body: [[
          {
            text: 'PROGRAMMES IN SCOPE',
            color: '#ffffff',
            bold: true,
            fontSize: 7.25,
            characterSpacing: 0.55,
            fillColor: colors.brand,
            margin: [10, 6, 8, 6],
          },
          {
            text: programmeScopeText,
            color: colors.ink,
            bold: true,
            fontSize: 8.75,
            lineHeight: 1.25,
            fillColor: '#fef2f2',
            margin: [10, 6, 8, 6],
          },
        ]],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 5] as [number, number, number, number],
    });
  }

  if (showWhatWeTaught && whatWeTaughtBody.length) {
    stack.push(buildSubsectionPanel('What we taught', whatWeTaughtBody, colors.brand));
  }

  if (ledger.topicRows.length) {
    stack.push({
      text: 'Programme & course delivery',
      style: 'subsection',
      color: colors.brand,
      margin: [0, 2, 0, 4] as [number, number, number, number],
    });

    if (ledger.topicRows.length >= 2 && ledger.topicRows.length <= 4) {
      stack.push(...buildDeliveryTopicCardGrid(ledger.topicRows, colors, reflectionByKey, phaseLabelFor));
    } else {
      stack.push(buildDeliveryTopicTable(ledger.topicRows, colors, reflectionByKey, phaseLabelFor));
    }

    if (ledger.pathNote) {
      stack.push({
        table: {
          widths: ['*'],
          body: [[{
            text: ledger.pathNote,
            fontSize: 7.25,
            color: colors.muted,
            italics: true,
            lineHeight: 1.35,
            margin: [8, 6, 8, 6],
            fillColor: '#f9fafb',
          }]],
        },
        layout: cardBorderLayout('#d1d5db'),
        margin: [0, 0, 0, 5] as [number, number, number, number],
      });
    }
  }

  const evidencePanel = buildBulletPanel(
    'Evidence captured',
    ledger.evidenceLines,
    colors.emerald ?? '#059669',
    colors.emerald ?? '#059669',
  );
  const nextPanel = ledger.nextLines.length
    ? buildSubsectionPanel(
        NEXT_TERM_FOCUS_LABEL,
        buildNextLinesPdfCallout(ledger.nextLines, colors).slice(1),
        colors.brand,
        '#fff7f7',
      )
    : null;

  if (evidencePanel && nextPanel) {
    stack.push({
      columns: [
        { width: '*', ...evidencePanel },
        { width: 12, text: '' },
        { width: '*', ...nextPanel },
      ],
      margin: [0, 0, 0, 5] as [number, number, number, number],
    });
  } else if (evidencePanel) {
    stack.push(evidencePanel);
  } else if (nextPanel) {
    stack.push(nextPanel);
  }

  return stack;
}
