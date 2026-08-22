import { computeWeightedScore, getWAECGrade, type ScoreComponents, type ScoreWeights } from '@/lib/grading';
import { hostSchoolScoreboard } from '@/lib/academic/host-marks';
import { parseScoreAuthority } from '@/lib/reports/complement';

type ProgressReportScoreSource = {
  theory_score?: unknown;
  practical_score?: unknown;
  attendance_score?: unknown;
  participation_score?: unknown;
  engagement_metrics?: unknown;
};

function score(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function metrics(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Convert the legacy report column names into the canonical six assessment
 * components. The odd column mapping is retained for database compatibility;
 * all new calculations go through this adapter.
 */
export function progressReportScoreComponents(report: ProgressReportScoreSource): ScoreComponents {
  const engagement = metrics(report.engagement_metrics);
  return {
    theory: score(report.theory_score),
    classwork: score(engagement.classwork_score),
    practical: score(report.practical_score),
    assignments: score(report.attendance_score),
    attendance: score(report.participation_score),
    assessment: score(engagement.assessment_score),
  };
}

export function deriveProgressReportResult(report: ProgressReportScoreSource, weights?: ScoreWeights): {
  overallScore: number;
  overallGrade: string;
  components: ScoreComponents;
} {
  const components = progressReportScoreComponents(report);
  const overallScore = computeWeightedScore(components, weights);
  return {
    overallScore,
    overallGrade: getWAECGrade(overallScore).code,
    components,
  };
}

/** Compulsory papers add together. Do not send this through the 6-box weights. */
export function deriveHostSchoolReportResult(metrics: unknown): {
  overallScore: number;
  overallGrade: string;
} | null {
  const board = hostSchoolScoreboard(metrics);
  if (!board?.complete) return null;
  return {
    overallScore: board.total.percent,
    overallGrade: getWAECGrade(board.total.percent).code,
  };
}

export const PROGRESS_REPORT_SCORE_FIELDS = [
  'theory_score',
  'practical_score',
  'attendance_score',
  'participation_score',
  'engagement_metrics',
] as const;

export function touchesProgressReportScores(value: Record<string, unknown>): boolean {
  return PROGRESS_REPORT_SCORE_FIELDS.some((field) => field in value);
}

/** True when a component was never stored. Typed `0` is a real score and must be kept. */
export function isUnsetScore(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Form display: blank stays blank; typed 0 stays "0". */
export function scoreFieldToFormValue(value: unknown): string {
  if (isUnsetScore(value)) return '';
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return '';
  return String(parsed);
}

/** Save path: blank → null; typed 0 → 0. */
export function parseOptionalScore(value: unknown): number | null {
  if (isUnsetScore(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

/** Preview / weighting math treats unset as 0 without persisting it. */
export function parseScoreForDisplay(value: unknown): number {
  return parseOptionalScore(value) ?? 0;
}

export function allProgressReportScoresPresent(report: ProgressReportScoreSource): boolean {
  const engagement = metrics(report.engagement_metrics);
  return !isUnsetScore(report.theory_score)
    && !isUnsetScore(report.practical_score)
    && !isUnsetScore(report.attendance_score)
    && !isUnsetScore(report.participation_score)
    && !isUnsetScore(engagement.classwork_score)
    && !isUnsetScore(engagement.assessment_score);
}

export function applyOptionalScoresToPayload(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
): void {
  const scoreKeys = ['theory_score', 'practical_score', 'attendance_score', 'participation_score'] as const;
  for (const key of scoreKeys) {
    if (!(key in body)) continue;
    payload[key] = parseOptionalScore(body[key]);
  }
  if ('engagement_metrics' in body && body.engagement_metrics && typeof body.engagement_metrics === 'object') {
    const incoming = body.engagement_metrics as Record<string, unknown>;
    const base = payload.engagement_metrics && typeof payload.engagement_metrics === 'object' && !Array.isArray(payload.engagement_metrics)
      ? { ...(payload.engagement_metrics as Record<string, unknown>) }
      : { ...incoming };
    if ('classwork_score' in incoming) base.classwork_score = parseOptionalScore(incoming.classwork_score);
    if ('assessment_score' in incoming) base.assessment_score = parseOptionalScore(incoming.assessment_score);
    payload.engagement_metrics = base;
  }
}

export function hasRecordedProgressReportScores(
  report: ProgressReportScoreSource & { overall_score?: unknown },
): boolean {
  const components = progressReportScoreComponents(report);
  const overall = score(report.overall_score);
  return [
    components.theory,
    components.classwork,
    components.practical,
    components.assignments,
    components.attendance,
    components.assessment,
    overall,
  ].some((value) => value > 0);
}

/** Published, typed, or legacy Builder rows must not be auto-replaced. */
export function isLockedLearnerResult(
  report: ProgressReportScoreSource & {
    calculation_mode?: unknown;
    is_published?: unknown;
    overall_score?: unknown;
  },
): boolean {
  if (report.is_published === true) return true;
  const mode = String(report.calculation_mode || '').toLowerCase();
  if (mode === 'manual') return true;
  if (mode === 'automatic') return false;
  return hasRecordedProgressReportScores(report);
}

type AutomaticEvidenceReport = ProgressReportScoreSource & {
  calculation_mode?: unknown;
  calculation_snapshot?: unknown;
  overall_score?: unknown;
};

/**
 * Auto-fill ran but nothing was assessed for this term (applied_weight = 0).
 * Do not show zero-filled score breakdowns — they look like typed scores.
 */
export function automaticResultHasNoEvidence(report: AutomaticEvidenceReport): boolean {
  if (String(report.calculation_mode || '').toLowerCase() !== 'automatic') return false;
  const snapshot = metrics(report.calculation_snapshot);
  const appliedWeight = Number(snapshot.applied_weight);
  if (Number.isFinite(appliedWeight)) return appliedWeight <= 0;
  return !hasRecordedProgressReportScores(report);
}

/** Whether the report card / publish view should show numeric scores. */
export function reportHasDisplayableScores(report: AutomaticEvidenceReport): boolean {
  if (automaticResultHasNoEvidence(report)) return false;
  if (String(report.calculation_mode || '').toLowerCase() === 'manual') {
    const engagement = metrics(report.engagement_metrics);
    return [
      report.theory_score,
      report.practical_score,
      report.attendance_score,
      report.participation_score,
      engagement.classwork_score,
      engagement.assessment_score,
      report.overall_score,
    ].some((value) => !isUnsetScore(value));
  }
  return hasRecordedProgressReportScores(report) || !isUnsetScore(report.overall_score);
}

export function autoFillResultMessage(calculation: unknown): string {
  const snapshot = metrics(calculation);
  if (snapshot.skipped === 'host_school' || parseScoreAuthority(snapshot) === 'host_school') {
    return autoFillHostSchoolMessage();
  }
  const appliedWeight = Number(snapshot.applied_weight);
  if (Number.isFinite(appliedWeight) && appliedWeight <= 0) {
    return 'No class evidence for this term yet. Teach, take attendance, or generate the school test from taught weeks — Write will fill from that.';
  }
  return 'Draft filled from class work. Review in Write, then Publish.';
}

export function autoFillHostSchoolMessage(): string {
  return 'Draft prepared. First Test, Second Test and Examination stay as the school papers — review them in Write. Classwork, assignments and projects sit beside them.';
}
