import { formatClassDisplay } from '../../display-labels';
import { buildCelebrationWallPdfStack } from '../../topics-covered-presentation';
import { borderedSegment, pairedSegmentColumns } from '../layout';
import { briefLearnerLine, textList } from '../text';
import { INK, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Learner highlights beside the celebration wall.
 *
 * The pair renders together or not at all — a lone "Celebration wall" column
 * with an empty neighbour looks like a layout fault. When highlights exist but
 * no learner reached the Excellent band, the wall says so explicitly rather
 * than sitting blank.
 */
export function buildLearnerHighlightsSection(ctx: SchoolReportPdfContext): object[] {
  const { showSec, insights, brand } = ctx;
  if (!showSec('learnerHighlights')) return [];
  if (!insights?.learnerHighlights?.length && !insights?.celebrationWall?.length) return [];

  const colors = { ink: INK, brand, muted: MUTED };

  return [
    {
      ...pairedSegmentColumns(
        borderedSegment(
          'Learner highlights',
          [textList((insights?.learnerHighlights || []).slice(0, 3).map(briefLearnerLine), '#067647')],
          '#067647',
          '#f0fdf4',
        ),
        borderedSegment(
          'Celebration wall',
          insights?.celebrationWall?.length
            ? buildCelebrationWallPdfStack(
                insights.celebrationWall.map((row) => ({
                  name: row.name,
                  classLabel: formatClassDisplay(row.className),
                  // Strip the "Result:" prefix the shared formatter needs but the
                  // wall does not show.
                  highlight: briefLearnerLine(`Result: ${String(row.highlight)}`).replace(/^Result:\s*/, ''),
                })),
                colors,
              )
            : [{ text: 'No Excellent band learners this term.', color: MUTED, italics: true, fontSize: 8 }],
          brand,
          '#fff7f7',
        ),
      ),
    },
  ];
}
