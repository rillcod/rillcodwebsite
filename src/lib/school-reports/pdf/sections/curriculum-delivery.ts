import { buildCurriculumDeliveryPdfStack } from '../../delivery-presentation';
import { schoolReportPhaseLabel } from '../../report-policy';
import { buildProgrammeSpotlightPdfStack } from '../../topics-covered-presentation';
import { fmtPct } from '../blocks';
import { borderedSegment, flowingDataTable, sectionTitle } from '../layout';
import { topicsCoveredPdfBody } from '../topics';
import { wrapPdfText } from '../text';
import { INK, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Curriculum delivery — FOUR mutually exclusive variants, resolved in one place.
 *
 * The book must carry exactly one account of what was taught. Previously these
 * were four separate spread expressions in the document body whose conditions
 * had to stay in agreement by hand:
 *
 *   showDelivery
 *   showSec('moduleCoverage') && !ledger.topicRows.length && insights.moduleCoverage.length
 *   !reflections.length && insights.programmeSpotlights.length && !moduleCoverage && !showDelivery
 *   !reflections.length && !insights.programmeSpotlights.length && insights.programmeSpotlight && !moduleCoverage
 *
 * Nothing enforced that at most one could match, and nothing flagged it if none
 * did. Expressing the choice as an ordered if/else makes the exclusivity a
 * property of the code rather than a coincidence of four negated conditions —
 * and a school can no longer receive a report with two delivery sections, or
 * with none because a fifth combination fell through the gaps.
 *
 * Order is significant: richest evidence first, thinnest fallback last.
 */
export function buildCurriculumDeliverySection(ctx: SchoolReportPdfContext): object[] {
  const {
    snapshot,
    narrative,
    insights,
    brand,
    showSec,
    deliveryLedger,
    showDelivery,
    showWhatWeTaught,
    programmeScopeText,
    programmeReflections,
    programmeReflectionByKey,
    reportPolicy,
  } = ctx;

  const colors = { ink: INK, brand, muted: MUTED };

  // 1. Full delivery narrative — the richest view, driven by the ledger.
  if (showDelivery) {
    return [
      sectionTitle('Curriculum delivery'),
      ...buildCurriculumDeliveryPdfStack({
        ledger: deliveryLedger,
        colors: { ...colors, emerald: '#059669' },
        programmeScopeText: programmeScopeText || undefined,
        showWhatWeTaught,
        whatWeTaughtBody: showWhatWeTaught
          ? topicsCoveredPdfBody(narrative, snapshot, colors)
          : [],
        reflectionByKey: programmeReflectionByKey,
        phaseLabelFor: (programme: string) =>
          `${schoolReportPhaseLabel(
            reportPolicy,
            snapshot.period.academicTermNumber || snapshot.period.curriculumStart.term || 1,
            programme,
          )} phase`,
      }),
      // Spotlights only add value when the ledger had no topic rows of its own.
      ...(insights?.programmeSpotlights?.length && !deliveryLedger.topicRows.length
        ? [borderedSegment(
            'Programmes & courses this term',
            buildProgrammeSpotlightPdfStack(insights.programmeSpotlights, colors),
            brand,
          )]
        : []),
    ];
  }

  // 2. Module coverage table — no narrative, but per-course figures exist.
  if (showSec('moduleCoverage') && !deliveryLedger.topicRows.length && insights?.moduleCoverage?.length) {
    return [
      sectionTitle('Topics & module coverage'),
      flowingDataTable(
        ['Programme', 'Course', 'Done', 'Plan', 'Cover %', 'Status'],
        insights.moduleCoverage.map((row) => [
          wrapPdfText(row.programme, { fontSize: 7.5, lineHeight: 1.2 }),
          wrapPdfText(row.course, { fontSize: 7.5, lineHeight: 1.2 }),
          { text: String(row.completed), fontSize: 8, alignment: 'center' },
          { text: String(row.planned), fontSize: 8, alignment: 'center' },
          { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right' },
          wrapPdfText(row.status, { fontSize: 7.5, color: row.status === 'Complete' ? '#067647' : MUTED, lineHeight: 1.15 }),
        ]),
        ['*', '*', 42, 42, 42, 58],
      ),
    ];
  }

  // From here on both remaining variants require no reflections and no module
  // coverage view, so they are ordered by how much spotlight data exists.
  if (programmeReflections.length || showSec('moduleCoverage')) return [];

  // 3. Several programme spotlights.
  if (insights?.programmeSpotlights?.length) {
    return [
      borderedSegment(
        'Curriculum delivery',
        buildProgrammeSpotlightPdfStack(insights.programmeSpotlights, colors),
        brand,
      ),
    ];
  }

  // 4. A single spotlight — the thinnest account the book will print.
  if (insights?.programmeSpotlight) {
    return [
      {
        stack: [
          { text: 'Curriculum delivery', style: 'subsection', color: brand },
          {
            text: `${insights.programmeSpotlight.programme}  |  ${insights.programmeSpotlight.course}`,
            bold: true,
            fontSize: 9,
            color: INK,
            margin: [0, 0, 0, 2],
          },
          { text: insights.programmeSpotlight.summary, fontSize: 8, color: MUTED, margin: [0, 0, 0, 2] },
          { text: insights.programmeSpotlight.nextIntro, fontSize: 8, color: INK },
        ],
        margin: [0, 0, 0, 8] as [number, number, number, number],
      },
    ];
  }

  return [];
}
