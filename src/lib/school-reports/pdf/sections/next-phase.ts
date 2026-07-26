import { flowingDataTable, sectionTitle } from '../layout';
import { textList, wrapPdfText } from '../text';
import { INK, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Progressive next phase.
 *
 * Appearance is decided in the context (showNextPhaseSection) because it
 * depends on the POST-FILTER contents: actions already stated in the summary,
 * strengths or focus areas are removed first, and a phase whose actions are all
 * duplicates is dropped entirely. Testing the raw insight lists here would
 * print a heading above nothing.
 */
export function buildNextPhaseSection(ctx: SchoolReportPdfContext): object[] {
  const { showNextPhaseSection, filteredNextPhaseSchool, filteredInvolvement, insights } = ctx;
  if (!showNextPhaseSection) return [];

  return [
    sectionTitle('Progressive next phase'),
    ...(filteredNextPhaseSchool.map((phase) => ({
      stack: [
        { text: phase.phase, bold: true, fontSize: 9, color: INK, margin: [0, 0, 0, 1] },
        { text: phase.horizon, color: MUTED, fontSize: 7.5, margin: [0, 0, 0, 2] },
        textList(phase.actions),
      ],
      margin: [0, 0, 0, 4],
    })) as object[]),
    ...(filteredInvolvement.length
      ? [{
          stack: [
            { text: 'How everyone stays involved', style: 'subsection' },
            textList(filteredInvolvement),
          ],
          margin: [0, 2, 0, 8],
        }]
      : []),
    ...(insights?.nextPhaseLearners?.length
      ? [flowingDataTable(
          ['Learner band', 'Count', 'Next phase for this band'],
          insights.nextPhaseLearners.map((row) => [
            wrapPdfText(row.band, { fontSize: 8, bold: true, lineHeight: 1.2 }),
            { text: String(row.count), fontSize: 8, alignment: 'center' },
            wrapPdfText(row.nextStep, { fontSize: 7.5, color: MUTED, lineHeight: 1.25 }),
          ]),
          [90, 36, '*'],
        )]
      : []),
  ];
}
