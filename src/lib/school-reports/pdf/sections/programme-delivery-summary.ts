import { formatCourseDisplay, formatProgrammeDisplay } from '../../display-labels';
import { fmtPct } from '../blocks';
import { flowingDataTable, sectionTitle } from '../layout';
import { wrapPdfText } from '../text';
import { MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Programme delivery summary — the FALLBACK view of what was taught.
 *
 * This is deliberately the last of three mutually exclusive delivery sections.
 * It renders only when neither the module-coverage view nor the richer
 * curriculum-delivery narrative has anything to show, so the book always
 * carries exactly one account of delivery — never two, never none.
 */
export function buildProgrammeDeliverySummarySection(ctx: SchoolReportPdfContext): object[] {
  const { snapshot, showSec, deliveryLedger, showDelivery, hasStaffDelivery } = ctx;
  if (showSec('moduleCoverage') || deliveryLedger.topicRows.length || showDelivery) return [];

  const curriculumRows = snapshot.curriculum.courses.length
    ? snapshot.curriculum.courses.map((row) => [
        wrapPdfText(formatCourseDisplay(row.course), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(formatProgrammeDisplay(row.programme), { fontSize: 7.5, color: MUTED, lineHeight: 1.2 }),
        { text: `${row.completed}/${row.planned}`, fontSize: 8, alignment: 'center' },
        { text: String(row.inProgress), fontSize: 8, alignment: 'center' },
        { text: String(row.skipped), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'No curriculum data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  return [
    sectionTitle('Programme delivery summary'),
    {
      // Staff-confirmed delivery is described in topics; otherwise fall back to
      // the raw week counts, which is all the data supports.
      text: hasStaffDelivery
        ? `${snapshot.deliveryDeclaration?.selectedTopics.length || 0} module topic(s) confirmed for this reporting period  |  ${snapshot.curriculum.completedWeeks} module unit(s) delivered  |  ${snapshot.curriculum.plannedWeeks}-unit reporting window`
        : `${snapshot.curriculum.completedWeeks} completed  |  ${snapshot.curriculum.inProgressWeeks} in progress  |  ${snapshot.curriculum.plannedWeeks} planned`,
      color: MUTED,
      fontSize: 8,
      margin: [0, 0, 0, 6],
    },
    flowingDataTable(
      ['Course', 'Programme', 'Delivered', 'Active', 'Deferred', 'Coverage'],
      curriculumRows,
      ['*', 72, 40, 40, 40, 42],
    ),
  ];
}
