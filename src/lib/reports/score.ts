import { computeWeightedScore, getWAECGrade, type ScoreComponents, type ScoreWeights } from '@/lib/grading';

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
