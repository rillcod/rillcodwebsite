import { formatClassDisplay } from '../../display-labels';
import { fmtPct } from '../blocks';
import { borderedSegment, pairedSegmentColumns, sectionTitle } from '../layout';
import { sectionLeadBlock } from '../section-leads';
import { textList } from '../text';
import { INK, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Partnership briefing — strengths beside focus areas.
 *
 * Both lists are de-duplicated against the briefing corpus in the context, so
 * the briefing never restates a point the executive summary or delivery lines
 * already made. Risks are a separate block and appear only when there are any:
 * an empty "cases needing immediate care" heading reads as an omission.
 */
export function buildPartnershipBriefingSection(ctx: SchoolReportPdfContext): object[] {
  const { showSec, overallTopScorer, pdfStrengthItems, pdfFocusItems, insights, brand } = ctx;
  if (!showSec('boardBriefing')) return [];

  return [
    sectionTitle('Partnership briefing'),
      ...sectionLeadBlock(ctx.sectionLeads, 'partnershipBriefing', MUTED),
    {
      ...pairedSegmentColumns(
        borderedSegment(
          'Strengths & excellence',
          [
            ...(overallTopScorer
              ? [{
                  table: {
                    widths: [58, '*'],
                    body: [[
                      {
                        stack: [
                          { text: fmtPct(overallTopScorer.averageScore), color: '#ffffff', bold: true, fontSize: 13, alignment: 'center' },
                          { text: 'Top score', color: '#d1fae5', bold: true, fontSize: 6, alignment: 'center', margin: [0, 2, 0, 0] },
                        ],
                        fillColor: '#067647',
                        margin: [4, 8, 4, 8],
                      },
                      {
                        stack: [
                          { text: 'Overall top scorer', color: '#067647', bold: true, fontSize: 6.5 },
                          { text: overallTopScorer.name, color: INK, bold: true, fontSize: 9, margin: [0, 2, 0, 1] },
                          { text: formatClassDisplay(overallTopScorer.className), color: MUTED, fontSize: 7 },
                        ],
                        fillColor: '#ecfdf3',
                        margin: [8, 6, 7, 6],
                      },
                    ]],
                  },
                  layout: 'noBorders',
                  margin: [0, 0, 0, 7],
                }]
              : []),
            textList(pdfStrengthItems, '#067647'),
          ],
          '#067647',
          '#f0fdf4',
        ),
        borderedSegment(
          'Partnership focus',
          [textList(pdfFocusItems, brand)],
          brand,
          '#fff7f7',
        ),
      ),
      margin: [0, 0, 0, 6],
    },
    ...(insights?.risks?.length
      ? [{
          stack: [
            { text: 'Cases needing immediate joint care', style: 'subsection', color: '#b42318' },
            textList(insights.risks, '#b42318'),
          ],
          margin: [0, 0, 0, 6] as [number, number, number, number],
        }]
      : []),
  ];
}
