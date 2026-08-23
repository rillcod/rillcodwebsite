import {
  hostPapersFromMetrics,
  hostSchoolTotal,
  hostPapersComplete,
  type HostAssessmentKind,
  type HostMark,
  type HostPaperMarks,
} from '@/lib/academic/host-marks';
import { getWAECGrade } from '@/lib/grading';

/**
 * The class broadsheet: every learner down the side, all three papers across.
 *
 * The three compulsory papers already existed, but only one student at a time
 * inside the report writer, where each paper was a link out to a separate screen.
 * Entering a term for a class of forty meant a hundred and twenty round trips, and
 * there was nowhere at all to see a class together — no totals beside each other,
 * no positions, no way to spot the learner nobody has marked yet.
 *
 * `HostPaperDatasheet` covers entering one paper for a whole class, which is how
 * marking actually happens. This is the other half: the sheet you read. It shares
 * host-marks rather than recomputing anything, so a total here and a total on a
 * report card cannot disagree.
 *
 * Pure and sortable without a database so the ranking rules are testable, because
 * position is the part people argue about.
 */

export const BROADSHEET_PAPERS: HostAssessmentKind[] = ['first_test', 'second_test', 'examination'];

export type BroadsheetSource = {
  studentId: string;
  studentName: string;
  /** engagement_metrics from the learner's progress report for this course + term. */
  metrics: unknown;
};

export type BroadsheetRow = {
  studentId: string;
  studentName: string;
  papers: HostPaperMarks;
  total: HostMark | null;
  /** WAEC code (A1…F9). Null until every paper is marked — a part-total is not a grade. */
  grade: string | null;
  /** 1-based rank by total. Null while incomplete, so an unmarked learner is not "last". */
  position: number | null;
  complete: boolean;
  /** Papers still to be marked, for the "who is outstanding" count. */
  missing: HostAssessmentKind[];
};

export type BroadsheetSummary = {
  rows: BroadsheetRow[];
  /** Learners with all three papers marked. */
  completeCount: number;
  studentCount: number;
  /** Mean total percent across complete rows only. Null when none are complete. */
  averagePercent: number | null;
  highestPercent: number | null;
  lowestPercent: number | null;
};

function missingPapers(papers: HostPaperMarks): HostAssessmentKind[] {
  return BROADSHEET_PAPERS.filter((kind) => !papers[kind]);
}

/**
 * Ranks by total percent, highest first. Equal totals share a position and the next
 * position skips accordingly — two learners on 1st means the next is 3rd, which is
 * what a school report is expected to say.
 */
function assignPositions(rows: BroadsheetRow[]): void {
  const ranked = rows
    .filter((row) => row.complete && row.total)
    .sort((a, b) => (b.total!.percent - a.total!.percent));

  let lastPercent: number | null = null;
  let lastPosition = 0;
  ranked.forEach((row, index) => {
    const percent = row.total!.percent;
    if (lastPercent !== null && percent === lastPercent) {
      row.position = lastPosition;
      return;
    }
    row.position = index + 1;
    lastPosition = row.position;
    lastPercent = percent;
  });
}

export function buildBroadsheet(sources: BroadsheetSource[]): BroadsheetSummary {
  const rows: BroadsheetRow[] = (sources ?? []).map((source) => {
    const papers = hostPapersFromMetrics(source.metrics);
    const complete = hostPapersComplete(papers);
    // A total is only meaningful once every paper is in; a part-total read as a
    // final mark is how a learner ends up looking like a failure mid-term.
    const total = complete ? hostSchoolTotal(papers) : null;
    return {
      studentId: source.studentId,
      studentName: source.studentName,
      papers,
      total,
      grade: total ? getWAECGrade(total.percent).code : null,
      position: null,
      complete,
      missing: missingPapers(papers),
    };
  });

  assignPositions(rows);

  const percents = rows
    .filter((row) => row.complete && row.total)
    .map((row) => row.total!.percent);

  return {
    rows,
    studentCount: rows.length,
    completeCount: percents.length,
    averagePercent: percents.length
      ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
      : null,
    highestPercent: percents.length ? Math.max(...percents) : null,
    lowestPercent: percents.length ? Math.min(...percents) : null,
  };
}

/** Alphabetical by learner name, which is the order a class register is read in. */
export function sortByName(rows: BroadsheetRow[]): BroadsheetRow[] {
  return [...rows].sort((a, b) =>
    (a.studentName ?? '').localeCompare(b.studentName ?? '', undefined, { sensitivity: 'base' }));
}

/** Best first, with unmarked learners kept at the end rather than ranked as lowest. */
export function sortByPosition(rows: BroadsheetRow[]): BroadsheetRow[] {
  return [...rows].sort((a, b) => {
    if (a.position && b.position) return a.position - b.position;
    if (a.position) return -1;
    if (b.position) return 1;
    return (a.studentName ?? '').localeCompare(b.studentName ?? '', undefined, { sensitivity: 'base' });
  });
}

/** Learners with at least one paper outstanding — the end-of-term chase list. */
export function outstandingRows(rows: BroadsheetRow[]): BroadsheetRow[] {
  return rows.filter((row) => !row.complete);
}
