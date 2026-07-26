/**
 * Adaptive page density.
 *
 * The appendices scale with roster size while everything else is fixed, so a
 * 400-learner school receives the same book as a 12-learner one but forty pages
 * longer. Above a threshold the datasheets tighten: smaller type, less row
 * padding, fewer chart bars.
 *
 * Deliberately a step change, not a continuous scale. Two schools of similar
 * size must receive visually identical books — a formula would give a 118- and
 * a 122-learner school subtly different typography and make reports impossible
 * to compare side by side.
 *
 * `comfortable` reproduces the current values exactly, so no existing report
 * changes appearance. Only rosters past the threshold are affected.
 */

export type ReportDensity = 'comfortable' | 'compact';

export type DensityMetrics = {
  density: ReportDensity;
  /** Vertical padding inside appendix table rows. */
  appendixRowPadding: number;
  /** Body font size for appendix datasheet cells. */
  appendixFontSize: number;
  /** Bars before a chart is truncated. */
  maxChartBars: number;
  /** Learners past which the roster is worth tightening. */
  threshold: number;
};

/**
 * Roster size at which datasheets tighten. ~120 learners is roughly where the
 * roster stops fitting in three printed pages at comfortable spacing.
 */
export const DENSITY_THRESHOLD = 120;

const COMFORTABLE: DensityMetrics = {
  density: 'comfortable',
  appendixRowPadding: 3,
  appendixFontSize: 7.5,
  maxChartBars: 10,
  threshold: DENSITY_THRESHOLD,
};

const COMPACT: DensityMetrics = {
  density: 'compact',
  appendixRowPadding: 2,
  appendixFontSize: 7,
  maxChartBars: 8,
  threshold: DENSITY_THRESHOLD,
};

export function resolveReportDensity(learnerCount: number): DensityMetrics {
  const count = Number.isFinite(learnerCount) ? Math.max(0, Math.trunc(learnerCount)) : 0;
  return count > DENSITY_THRESHOLD ? COMPACT : COMFORTABLE;
}
