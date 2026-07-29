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
  const { snapshot, sortedLearners } = ctx;
  if (!ctx.showSec('appendixGradebook') || sortedLearners.length === 0) return [];
  const learnersWithAssignmentEvidence = sortedLearners.filter(
    (row) =>
      row.gradebook?.fromPublishedReport
      || row.gradebook?.classworkScore != null
      || row.gradebook?.assignmentAverage != null
      || row.gradebook?.assessmentScore != null,
  ).length;
  if (learnersWithAssignmentEvidence === 0) return [];

  return [
    appendixSectionStack(
      appendixHero({
        letter: 'C',
        title: 'Classwork, assignments and assessment',
        subtitle: `${formatTermPeriod(snapshot)}. Teacher-entered component scores are preserved and shown with connected classwork and assignment evidence. Theory, practical and exam results are in Appendix A.`,
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
