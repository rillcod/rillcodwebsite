import {
  appendixHeaderCells,
  appendixHero,
  printableAppendixTable,
  scorePctCell,
  statusBadgeCell,
} from '../appendix';
import { appendixSectionStack, buildGroupedLearnerTableRows } from '../blocks';
import { cleanDisplayText } from '../text';
import { APPENDIX_A_ACCENT, APPENDIX_ROSTER_TINT, INK, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Appendix A — learner roster.
 *
 * Rows are grouped by grade and class, which is how a school files them. Exam
 * score falls back to the term average when no exam was recorded, so a learner
 * with coursework but no final paper still appears with a figure rather than a
 * dash that reads as "not assessed".
 */
export function buildAppendixLearnerRosterSection(ctx: SchoolReportPdfContext): object[] {
  if (!ctx.showSec('learnerRoster')) return [];

  const { snapshot, sortedLearners } = ctx;
  const rosterAssessedCount = sortedLearners.filter(
    (row) => row.gradebook?.examScore != null || row.averageScore != null,
  ).length;
  const rosterExcellentCount = sortedLearners.filter((row) => row.status === 'Excellent').length;

  const learnerRows = sortedLearners.length
    ? buildGroupedLearnerTableRows(sortedLearners, 8, (row, labels) => {
        const gradebook = row.gradebook;
        const examScore = gradebook?.examScore ?? row.averageScore;
        return [
          { text: row.name, fontSize: 8, bold: true, color: INK },
          { text: labels.gradeLabel, fontSize: 7.5, bold: true, color: INK },
          { text: cleanDisplayText(labels.classLabel), fontSize: 7, color: MUTED },
          scorePctCell(gradebook?.theoryScore),
          scorePctCell(gradebook?.practicalScore),
          scorePctCell(examScore, true),
          scorePctCell(row.attendanceRate),
          statusBadgeCell(row.status),
        ];
      }, APPENDIX_A_ACCENT)
    : [[
        {
          text: 'Learner roster is not included in this report.',
          colSpan: 8,
          color: MUTED,
          italics: true,
          fontSize: 8,
        },
        {}, {}, {}, {}, {}, {}, {},
      ]];

  return [
    appendixSectionStack(
      appendixHero({
        letter: 'A',
        title: 'Learner roster',
        subtitle: `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — printable roster with exam scores, attendance, and status. Detach and archive for school records.`,
        accent: APPENDIX_A_ACCENT,
        chips: [
          { label: 'Active learners', value: String(sortedLearners.length) },
          { label: 'Assessed', value: String(rosterAssessedCount) },
          { label: 'Excellent', value: String(rosterExcellentCount) },
        ],
      }),
      printableAppendixTable(
        [
          appendixHeaderCells(['Learner', 'Grade', 'Class', 'Theory', 'Practical', 'Exam', 'Attend', 'Status']),
          ...learnerRows,
        ],
        ['*', 34, 64, 30, 30, 30, 34, 54],
        APPENDIX_ROSTER_TINT,
      ),
    ),
  ];
}
