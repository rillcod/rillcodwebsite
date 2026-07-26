import {
  formatClassDisplay,
  formatCourseDisplay,
  formatProgrammeCourseDisplay,
  formatProgrammeDisplay,
  REPORT_METRIC_LABELS,
} from '../../display-labels';
import { fmtPct } from '../blocks';
import { barChartBlock, pieChartBlock, scoreColor } from '../charts';
import { flowingDataTable, sectionTitle } from '../layout';
import { wrapPdfText } from '../text';
import { MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Distribution charts, or the plain outcomes table when charts are switched off.
 *
 * These are two mutually exclusive presentations of the same programme/course
 * data, so they resolve here together. Previously they were separate spreads
 * whose conditions were exact negations of each other maintained by hand —
 * the same failure shape as the delivery variants.
 */
export function buildChartsSection(ctx: SchoolReportPdfContext): object[] {
  const { snapshot, showSec, brand, programmeCourseRows, deliveryLedger } = ctx;

  const programmeRows = programmeCourseRows.length
    ? programmeCourseRows.map((row) => [
        wrapPdfText(formatProgrammeDisplay(row.programme), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(formatCourseDisplay(row.course), { fontSize: 8, lineHeight: 1.2 }),
        { text: String(row.enrolledStudents || row.students), fontSize: 8, alignment: 'center' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
        // An em dash, not 0%, when nothing was submitted — a zero would read as
        // "they scored nothing" rather than "nothing was assessed".
        { text: row.submissions > 0 ? fmtPct(row.averageScore) : '—', fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'No programme/course outcomes recorded', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  const outcomesTable = flowingDataTable(
    ['Programme', 'Course', REPORT_METRIC_LABELS.enrolledLearners, REPORT_METRIC_LABELS.assessedLearners, REPORT_METRIC_LABELS.meanPercent],
    programmeRows,
    [88, '*', 42, 48, 42],
  );

  // ── Charts off: the table alone carries the outcomes ──────────────────────
  if (!showSec('charts')) {
    if (!programmeCourseRows.length) return [];
    return [sectionTitle(REPORT_METRIC_LABELS.programmeCourseOutcomes), outcomesTable];
  }

  const classRows = snapshot.classPerformance.length
    ? snapshot.classPerformance.map((row) => [
        wrapPdfText(formatClassDisplay(row.className), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(row.teacherName || '-', { fontSize: 7.5, color: MUTED, lineHeight: 1.2 }),
        { text: String(row.students), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.averageScore), fontSize: 8, alignment: 'right', bold: true },
        { text: fmtPct(row.attendanceRate), fontSize: 8, alignment: 'right' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
      ])
    : [[{ text: 'No class data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  // Staff-declared coverage wins over the derived roll-up, so the chart agrees
  // with the figures printed in the delivery section.
  const declaredProgrammeCoverage = snapshot.deliveryDeclaration?.programmeCoverage || [];
  const programmeCoverageMap = new Map<string, { completed: number; planned: number }>();
  for (const row of programmeCourseRows) {
    if (!programmeCoverageMap.has(row.programme)) {
      programmeCoverageMap.set(row.programme, { completed: 0, planned: 0 });
    }
  }
  for (const row of snapshot.curriculum.courses) {
    const current = programmeCoverageMap.get(row.programme) || { completed: 0, planned: 0 };
    current.completed += Number(row.completed || 0);
    current.planned += Number(row.planned || 0);
    programmeCoverageMap.set(row.programme, current);
  }
  const programmeCoverageRows = declaredProgrammeCoverage.length
    ? declaredProgrammeCoverage.map((row) => ({ label: row.programme, value: row.coverage, color: scoreColor(row.coverage) }))
    : [...programmeCoverageMap.entries()].map(([programme, totals]) => {
        const value = totals.planned > 0 ? Math.round((totals.completed / totals.planned) * 100) : 0;
        return { label: programme, value, color: scoreColor(value) };
      });

  return [
    { text: 'Score and attendance distribution', style: 'subsection', color: brand },
    {
      columns: [
        { width: '*', ...pieChartBlock('Score bands', snapshot.scoreBands, { size: 92 }) },
        { width: '*', ...pieChartBlock('Attendance bands', snapshot.attendanceBands, { size: 92 }) },
      ],
      columnGap: 10,
      margin: [0, 0, 0, 4],
    },
    // Redundant once the delivery ledger has listed topics per course.
    ...(programmeCoverageRows.length && !deliveryLedger.topicRows.length
      ? [barChartBlock('Curriculum coverage by programme', programmeCoverageRows, { maxBars: 8 })]
      : []),
    { text: 'Class comparison', style: 'subsection', color: brand, margin: [0, 4, 0, 2] },
    barChartBlock(
      REPORT_METRIC_LABELS.classMeanScores,
      snapshot.classPerformance.map((row) => ({
        label: formatClassDisplay(row.className),
        value: row.averageScore,
        color: scoreColor(row.averageScore),
      })),
      { maxBars: 10 },
    ),
    flowingDataTable(
      ['Class', 'Teacher', 'Learners', 'Mean %', 'Attend %', 'Subs'],
      classRows,
      ['*', 70, 42, 48, 52, 42],
      { margin: [0, 4, 0, 6] },
    ),
    ...(programmeCourseRows.length
      ? [
          {
            text: REPORT_METRIC_LABELS.programmeCourseOutcomes,
            style: 'subsection',
            color: brand,
            margin: [0, 4, 0, 2],
          },
          barChartBlock(
            REPORT_METRIC_LABELS.meanByProgrammeCourse,
            programmeCourseRows.map((row) => ({
              label: formatProgrammeCourseDisplay(row.programme, row.course),
              value: row.submissions > 0 ? row.averageScore : 0,
              // Grey, not a score colour, when nothing was assessed.
              color: row.submissions > 0 ? scoreColor(row.averageScore) : '#94a3b8',
            })),
            { maxBars: 12 },
          ),
          flowingDataTable(
            ['Programme', 'Course', REPORT_METRIC_LABELS.enrolledLearners, REPORT_METRIC_LABELS.assessedLearners, REPORT_METRIC_LABELS.meanPercent],
            programmeRows,
            [88, '*', 42, 48, 42],
            { margin: [0, 6, 0, 8] },
          ),
        ]
      : []),
  ];
}
