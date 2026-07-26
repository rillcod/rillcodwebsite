import { REPORT_METRIC_LABELS } from '../../display-labels';
import { fmtPct } from '../blocks';
import { headerCells, sectionTitle, tableLayout } from '../layout';
import { withMinPresence } from '../text';
import { MUTED, PDF_MIN_TABLE } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Previous-term comparison.
 *
 * Appears only when a previous term is actually on file — a comparison table
 * with one row is worse than no table. Both rows are drawn from published
 * reports, so the figures are what each school was formally told at the time,
 * not a recomputation that might now disagree with the book they hold.
 */
export function buildPreviousTermComparisonSection(ctx: SchoolReportPdfContext): object[] {
  const { snapshot } = ctx;
  const previous = snapshot.previousTerm;
  if (!previous) return [];

  return [
    sectionTitle('Previous-term comparison'),
    withMinPresence(
      {
        unbreakable: true,
        stack: [
          {
            text: `Compared with ${previous.termLabel}, ${previous.academicYear}. Figures show the published report for each period.`,
            color: MUTED,
            fontSize: 8,
            margin: [0, 0, 0, 5],
          },
          {
            table: {
              widths: ['*', 75, 75, 75],
              body: [
                headerCells(['Period', REPORT_METRIC_LABELS.meanScore, 'Attendance', 'Curriculum']),
                [
                  { text: `${previous.termLabel}, ${previous.academicYear}`, fontSize: 8 },
                  { text: fmtPct(previous.averageScore), alignment: 'right', fontSize: 8 },
                  { text: fmtPct(previous.attendanceRate), alignment: 'right', fontSize: 8 },
                  { text: fmtPct(previous.curriculumCoverage), alignment: 'right', fontSize: 8 },
                ],
                [
                  { text: `${snapshot.period.termLabel}, ${snapshot.period.academicYear}`, bold: true, fontSize: 8 },
                  { text: fmtPct(snapshot.summary.averageScore), alignment: 'right', bold: true, fontSize: 8 },
                  { text: fmtPct(snapshot.summary.attendanceRate), alignment: 'right', bold: true, fontSize: 8 },
                  { text: fmtPct(snapshot.summary.curriculumCoverage), alignment: 'right', bold: true, fontSize: 8 },
                ],
              ],
            },
            layout: tableLayout(),
          },
        ],
      },
      PDF_MIN_TABLE,
    ),
  ];
}
