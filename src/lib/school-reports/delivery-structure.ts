import type { SchoolReportSnapshot } from './types';
import { buildDeliveryContext } from './delivered-topics';

export type DeliveryLedgerSnapshot = Pick<
  SchoolReportSnapshot,
  'school' | 'summary' | 'curriculum' | 'period' | 'programmeCoursePerformance'
>;

export type DeliveryTopicRow = {
  programme: string;
  course: string;
  weekRange: string;
  evidence: string;
  source: 'curriculum' | 'learner_evidence' | 'both';
};

/** Single non-duplicative delivery ledger — one source for PDF, preview, and briefing. */
export type DeliveryLedger = {
  windowLine: string;
  pathNote: string;
  topicRows: DeliveryTopicRow[];
  /** Scope & window only — no topic repetition. */
  plannedLines: string[];
  /** Operational evidence only — assignments, scores, attendance. */
  evidenceLines: string[];
  /** Next module steps — from curriculum / narrative. */
  nextLines: string[];
};

function buildEvidenceLines(
  snapshot: DeliveryLedgerSnapshot,
  evidenceQualityPct: number,
  manualResultCount = 0,
  manualRollCount = 0,
): string[] {
  const lines: string[] = [];

  if (snapshot.summary.assignmentsCreated > 0) {
    lines.push(`${snapshot.summary.assignmentsCreated} assignment(s) set this term.`);
  }
  if (snapshot.summary.submissionsReceived > 0) {
    lines.push(`${snapshot.summary.submissionsReceived} graded submission(s) in the gradebook.`);
  }
  lines.push(
    `${snapshot.summary.studentsWithScores} of ${snapshot.summary.activeStudents} learners with term scores (${evidenceQualityPct}% evidence depth).`,
  );
  if (manualResultCount > 0) {
    lines.push(`${manualResultCount} learner(s) via Manual Result Entry.`);
  }
  if (manualRollCount > 0) {
    lines.push(`${manualRollCount} learner(s) on the attendance roll.`);
  }
  if (snapshot.summary.curriculumCoverage > 0) {
    lines.push(
      `${snapshot.curriculum.completedWeeks}/${snapshot.curriculum.plannedWeeks} curriculum weeks marked on the map (${snapshot.summary.curriculumCoverage}%).`,
    );
  }
  return lines.slice(0, 5);
}

export function buildDeliveryLedger(
  snapshot: DeliveryLedgerSnapshot,
  opts: {
    nextLines: string[];
    curriculumRange: string;
    programmeNames: string[];
    evidenceQualityPct: number;
    manualResultCount?: number;
    manualRollCount?: number;
  },
): DeliveryLedger {
  const ctx = buildDeliveryContext(snapshot);
  const { curriculum } = snapshot;
  const termLabel = snapshot.period?.termLabel || 'this term';

  const topicRows: DeliveryTopicRow[] = ctx.programmes.flatMap((group) =>
    group.courses.map((course) => ({
      programme: group.programme,
      course: course.course,
      weekRange: course.weekRangeLabel,
      evidence: course.evidenceLabel,
      source: course.source,
    })),
  );

  const plannedLines = [
    opts.curriculumRange !== termLabel
      ? `Reporting window: ${opts.curriculumRange}${curriculum.plannedWeeks ? ` · ${curriculum.plannedWeeks} weeks mapped` : ''}.`
      : `${termLabel}${curriculum.plannedWeeks ? ` · ${curriculum.plannedWeeks}-week window mapped` : ''}.`,
    opts.programmeNames.length
      ? `Programmes in scope: ${opts.programmeNames.join(', ')}.`
      : null,
  ].filter(Boolean) as string[];

  const evidenceLines = buildEvidenceLines(
    snapshot,
    opts.evidenceQualityPct,
    opts.manualResultCount ?? 0,
    opts.manualRollCount ?? 0,
  );
  const nextLines =
    opts.nextLines.length > 0
      ? opts.nextLines.slice(0, 4)
      : ['Open the next planned module and refresh this book early next term.'];

  return {
    windowLine: plannedLines[0] || termLabel,
    pathNote: ctx.summary.deliveryPathNote,
    topicRows,
    plannedLines,
    evidenceLines,
    nextLines,
  };
}
