import { resolveLearnerGradeForDisplay } from '../aggregate';
import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from '../types';
import { cleanDisplayText, toTitleCase, withMinPresence } from './text';
import { BRAND, INK, MUTED, PDF_MIN_APPENDIX, PRINT_BORDER, PRINT_GROUP_BAR } from './tokens';

/**
 * Composite building blocks for the report book — one level up from raw text
 * cells, one level below a full section.
 *
 * Only blocks with no dependency back into the document builder live here, so
 * this module stays a leaf and the remaining split cannot introduce a cycle.
 */

export type GroupedLearnerRow = SchoolReportSnapshot['learners'][number];

/** Each appendix starts on its own page so it can be detached from the main report. */
export function appendixSectionStack(hero: object, table: object) {
  return withMinPresence(
    { stack: [hero, table], pageBreak: 'before' as const },
    PDF_MIN_APPENDIX,
  );
}

export function formatSchoolDisplayName(name: unknown): string {
  return cleanDisplayText(name) || 'Partner school';
}

export function formatTermPeriod(snapshot: SchoolPerformanceReportRow['snapshot']): string {
  return `${snapshot.period.termLabel}, ${snapshot.period.academicYear}`;
}

export function metaCaption(text: string, color = MUTED) {
  return {
    text: toTitleCase(text),
    style: 'metaLabel' as const,
    color,
  };
}

/** Percentages print without a trailing ".0" but keep one decimal when it matters. */
export const fmtPct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? '-' : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;

/** Class-grouped PDF table rows shared by Appendix A roster and Appendix C assignment gradebook. */
export function buildGroupedLearnerTableRows(
  rows: GroupedLearnerRow[],
  colSpan: number,
  buildRow: (row: GroupedLearnerRow, labels: ReturnType<typeof resolveLearnerGradeForDisplay>) => object[],
  _groupAccent = BRAND,
): object[][] {
  if (!rows.length) return [];
  return rows.flatMap((row, index) => {
    const labels = resolveLearnerGradeForDisplay(row);
    const previousLabels = index > 0 ? resolveLearnerGradeForDisplay(rows[index - 1]) : null;
    const groupKey = `${labels.gradeLabel}|${labels.classLabel}`;
    const previousGroupKey = previousLabels ? `${previousLabels.gradeLabel}|${previousLabels.classLabel}` : '';
    const dataRow = buildRow(row, labels);
    if (groupKey === previousGroupKey) return [dataRow];
    const filler = Array.from({ length: colSpan - 1 }, () => ({}));
    return [
      [
        {
          text: `${labels.gradeLabel}  ·  ${cleanDisplayText(labels.classLabel)}`,
          colSpan,
          bold: true,
          color: '#ffffff',
          fillColor: PRINT_GROUP_BAR,
          fontSize: 8,
          characterSpacing: 0.35,
          margin: [8, 6, 8, 6],
        },
        ...filler,
      ],
      dataRow,
    ];
  });
}

export function appendixStatChip(label: string, value: string, _color = BRAND) {
  return {
    width: 'auto' as const,
    table: {
      widths: [76],
      body: [
        [{ text: value, fontSize: 13, bold: true, color: INK, alignment: 'center' as const, margin: [0, 5, 0, 1] as [number, number, number, number] }],
        [{ text: toTitleCase(label), fontSize: 6.5, color: MUTED, alignment: 'center' as const, margin: [0, 0, 0, 5] as [number, number, number, number] }],
      ],
    },
    layout: {
      fillColor: () => '#ffffff',
      hLineColor: () => PRINT_BORDER,
      vLineColor: () => PRINT_BORDER,
      hLineWidth: (rowIndex: number) => (rowIndex === 0 ? 1.5 : 0.75),
      vLineWidth: () => 0.75,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 8, 0] as [number, number, number, number],
  };
}
