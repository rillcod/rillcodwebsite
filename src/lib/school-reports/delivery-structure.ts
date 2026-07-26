import type { SchoolReportSnapshot } from './types';
import { buildDeliveryContext } from './delivered-topics';
import { filterSchoolFacingLines, resolveSchoolFacingPathNote } from './report-content-dedup';
import { countNoun, nounFor } from './wording';

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
    lines.push(`${countNoun(snapshot.summary.assignmentsCreated, 'assignment')} set this term.`);
  }
  if (snapshot.summary.submissionsReceived > 0) {
    lines.push(`${snapshot.summary.submissionsReceived} graded ${nounFor(snapshot.summary.submissionsReceived, 'submission')} in the gradebook.`);
  }
  lines.push(
    `${snapshot.summary.studentsWithScores} of ${snapshot.summary.activeStudents} learners with term scores (${evidenceQualityPct}% evidence depth).`,
  );
  if (manualResultCount > 0) {
    lines.push(`${countNoun(manualResultCount, 'learner')} via teacher-recorded term assessments.`);
  }
  if (manualRollCount > 0) {
    lines.push(`${countNoun(manualRollCount, 'learner')} on the attendance roll.`);
  }
  if (snapshot.summary.curriculumCoverage > 0) {
    const windowWeeks = snapshot.curriculum.plannedWeeks;
    const confirmed = snapshot.curriculum.completedWeeks;
    if (windowWeeks > 0 && confirmed > 0) {
      lines.push(
        `Term delivery confirmed across ${confirmed} focused module ${nounFor(confirmed, 'week')} within the ${windowWeeks}-week reporting window (${snapshot.summary.curriculumCoverage}% pacing depth).`,
      );
    } else {
      lines.push(`Term delivery pacing depth: ${snapshot.summary.curriculumCoverage}%.`);
    }
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
  const nextLines = filterSchoolFacingLines(opts.nextLines, 4);

  return {
    windowLine: plannedLines[0] || termLabel,
    pathNote: resolveSchoolFacingPathNote(ctx.summary.deliveryPathNote),
    topicRows,
    plannedLines,
    evidenceLines,
    nextLines,
  };
}
