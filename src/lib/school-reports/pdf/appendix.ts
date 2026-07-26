import { compareLearnersForRoster } from '../aggregate';
import { buildGradebookSummarySheet } from '../gradebook-detail';
import { appendixStatChip, buildGroupedLearnerTableRows, fmtPct, type GroupedLearnerRow } from './blocks';
import { toTitleCase, withMinPresence, wrapPdfText } from './text';
import {
  APPENDIX_C_ACCENT,
  APPENDIX_ROSTER_TINT,
  BRAND,
  HEADER_BG,
  INK,
  MUTED,
  PRINT_BORDER,
  PRINT_BORDER_LIGHT,
} from './tokens';

/**
 * Appendix presentation — the detachable datasheets at the back of the book.
 *
 * These pages are printed and filed separately by partner schools, so they use
 * heavier borders and a distinct header treatment from the main report body.
 */

export function appendixHero(opts: {
  letter: string;
  title: string;
  subtitle: string;
  accent?: string;
  chips: Array<{ label: string; value: string; color?: string }>;
  showDetachNote?: boolean;
}) {
  const accent = opts.accent || BRAND;
  const showDetachNote = opts.showDetachNote !== false;
  return {
    stack: [
      {
        table: {
          widths: [56, '*'],
          body: [[
            {
              stack: [
                { text: 'Appendix', fontSize: 6, color: '#ffffff', alignment: 'center' as const, margin: [0, 0, 0, 1] as [number, number, number, number] },
                { text: opts.letter, fontSize: 28, bold: true, color: '#ffffff', alignment: 'center' as const, margin: [0, -2, 0, 0] as [number, number, number, number] },
              ],
              fillColor: accent,
              margin: [0, 8, 0, 8] as [number, number, number, number],
            },
            {
              stack: [
                { text: toTitleCase(opts.title), fontSize: 14, bold: true, color: INK, margin: [0, 0, 0, 4] as [number, number, number, number] },
                { text: opts.subtitle, fontSize: 8.25, color: MUTED, lineHeight: 1.35, margin: [0, 0, 0, 5] as [number, number, number, number] },
                { columns: opts.chips.map((chip) => appendixStatChip(chip.label, chip.value, chip.color || accent)) },
              ],
              fillColor: '#ffffff',
              margin: [12, 10, 12, 10] as [number, number, number, number],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => PRINT_BORDER,
          vLineColor: () => PRINT_BORDER,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },
      ...(showDetachNote
        ? [{
            text: 'This page may be detached from the main report book for filing or school records.',
            color: MUTED,
            fontSize: 6.75,
            italics: true,
            margin: [0, 0, 0, 6] as [number, number, number, number],
          }]
        : []),
    ],
  };
}

export function appendixHeaderCells(labels: string[]) {
  return labels.map((text) => ({
    text: toTitleCase(text),
    bold: true,
    fontSize: 7,
    color: '#ffffff',
    fillColor: HEADER_BG,
    margin: [0, 5, 0, 5] as [number, number, number, number],
  }));
}

export function appendixTableLayout(
  stripeTint = APPENDIX_ROSTER_TINT,
  /** Row padding; tightened for large rosters. Defaults to the comfortable value. */
  rowPadding = 3,
) {
  return {
    fillColor: (rowIndex: number) => (rowIndex === 0 ? HEADER_BG : rowIndex % 2 ? '#ffffff' : stripeTint),
    hLineWidth: () => 0.75,
    vLineWidth: () => 0.75,
    hLineColor: () => PRINT_BORDER_LIGHT,
    vLineColor: () => PRINT_BORDER_LIGHT,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => rowPadding,
    paddingBottom: () => rowPadding,
  };
}

export function scorePctCell(value: number | null | undefined, bold = false) {
  if (value == null || !Number.isFinite(Number(value))) {
    return { text: '—', fontSize: 7.5, alignment: 'right' as const, color: MUTED };
  }
  return {
    text: fmtPct(Number(value)),
    fontSize: bold ? 8.25 : 7.5,
    alignment: 'right' as const,
    bold,
    color: INK,
  };
}

export function statusBadgeCell(status: GroupedLearnerRow['status']) {
  return {
    text: toTitleCase(status),
    fontSize: 6,
    bold: true,
    color: INK,
    fillColor: '#ffffff',
    alignment: 'center' as const,
    border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
    borderColor: [PRINT_BORDER_LIGHT, PRINT_BORDER_LIGHT, PRINT_BORDER_LIGHT, PRINT_BORDER_LIGHT] as [string, string, string, string],
    margin: [2, 3, 2, 3] as [number, number, number, number],
  };
}

export function datasheetTextCell(text: string, opts?: { bold?: boolean; align?: 'left' | 'right' | 'center'; muted?: boolean }) {
  return wrapPdfText(text, {
    fontSize: 7.5,
    bold: opts?.bold,
    color: opts?.muted ? MUTED : INK,
    align: opts?.align || 'left',
    lineHeight: 1.25,
  });
}

export function buildAppendixCSummaryRows(learners: GroupedLearnerRow[]): object[][] {
  const sorted = [...learners].sort(compareLearnersForRoster);
  const summary = buildGradebookSummarySheet(sorted);

  return sorted.length
    ? buildGroupedLearnerTableRows(sorted, 4, (row) => {
        const rowSummary = summary.find((item) => item.learnerId === row.id);
        return [
          datasheetTextCell(row.name, { bold: true }),
          scorePctCell(rowSummary?.classworkScore ?? null),
          scorePctCell(rowSummary?.assignmentAverage ?? null, true),
          scorePctCell(rowSummary?.assessmentScore ?? null),
        ];
      }, APPENDIX_C_ACCENT)
    : [[
        { text: 'No learner records are included in this report.', colSpan: 4, color: MUTED, italics: true, fontSize: 8 },
        {}, {}, {},
      ]];
}

export function printableAppendixTable(
  body: object[][],
  widths: (string | number)[],
  stripeTint = APPENDIX_ROSTER_TINT,
  rowPadding = 3,
) {
  return withMinPresence(
    {
      table: {
        headerRows: 1,
        dontBreakRows: false,
        widths,
        body,
      },
      layout: appendixTableLayout(stripeTint, rowPadding),
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    36,
  );
}
