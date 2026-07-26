import {
  appendixHeaderCells,
  appendixHero,
  buildAppendixCSummaryRows,
  printableAppendixTable,
} from '../appendix';
import { appendixSectionStack, formatTermPeriod } from '../blocks';
import { APPENDIX_C_ACCENT, APPENDIX_GRADEBOOK_TINT } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Appendix C — classwork, assignments and assessment.
 *
 * Counts a learner as having evidence when ANY component is present, including
 * one carried from a published progress report. Requiring all three would show
 * schools a near-zero evidence figure for a term that was in fact recorded.
 */
export function buildAppendixGradebookSection(ctx: SchoolReportPdfContext): object[] {
  if (!ctx.showSec('appendixGradebook')) return [];

  const { snapshot, sortedLearners } = ctx;
  const learnersWithAssignmentEvidence = sortedLearners.filter(
    (row) =>
      row.gradebook?.fromPublishedReport
      || row.gradebook?.classworkScore != null
      || row.gradebook?.assignmentAverage != null
      || row.gradebook?.assessmentScore != null,
  ).length;

  return [
    appendixSectionStack(
      appendixHero({
        letter: 'C',
        title: 'Classwork, assignments and assessment',
        subtitle: `${formatTermPeriod(snapshot)}. One row per learner with published progress report component scores. Theory, practical and exam results are in Appendix A.`,
        accent: APPENDIX_C_ACCENT,
        chips: [
          { label: 'With evidence', value: `${learnersWithAssignmentEvidence}/${sortedLearners.length}` },
          { label: 'Learners', value: String(sortedLearners.length) },
        ],
      }),
      printableAppendixTable(
        [
          appendixHeaderCells(['Learner', 'Classwork', 'Assignments', 'Assessment']),
          ...buildAppendixCSummaryRows(sortedLearners),
        ],
        ['*', 52, 52, 52],
        APPENDIX_GRADEBOOK_TINT,
        ctx.densityMetrics.appendixRowPadding,
      ),
    ),
  ];
}
