import { describe, expect, it } from 'vitest';
import { DENSITY_THRESHOLD, resolveReportDensity } from './density';

describe('resolveReportDensity', () => {
  it('leaves small and mid-size schools exactly as they were', () => {
    // The comfortable metrics reproduce the pre-existing hardcoded values, so
    // adding adaptive density must not change a single existing report.
    for (const count of [0, 1, 12, 60, DENSITY_THRESHOLD]) {
      const metrics = resolveReportDensity(count);
      expect(metrics.density).toBe('comfortable');
      expect(metrics.appendixRowPadding).toBe(3);
      expect(metrics.appendixFontSize).toBe(7.5);
      expect(metrics.maxChartBars).toBe(10);
    }
  });

  it('tightens only past the threshold', () => {
    expect(resolveReportDensity(DENSITY_THRESHOLD).density).toBe('comfortable');
    expect(resolveReportDensity(DENSITY_THRESHOLD + 1).density).toBe('compact');
  });

  it('compacts padding, type size and chart bars together', () => {
    const metrics = resolveReportDensity(400);
    expect(metrics.appendixRowPadding).toBeLessThan(3);
    expect(metrics.appendixFontSize).toBeLessThan(7.5);
    expect(metrics.maxChartBars).toBeLessThan(10);
  });

  it('is a step change, so similar schools get identical books', () => {
    // A continuous formula would give a 118- and a 122-learner school subtly
    // different typography and make their reports impossible to compare.
    expect(resolveReportDensity(200)).toEqual(resolveReportDensity(400));
    expect(resolveReportDensity(10)).toEqual(resolveReportDensity(100));
  });

  it('treats nonsense roster counts as smallest, never densest', () => {
    // Failing open to "compact" would shrink a report because a count was
    // missing, which is the wrong direction to guess in.
    for (const bad of [Number.NaN, -50, Number.POSITIVE_INFINITY * 0]) {
      expect(resolveReportDensity(bad as number).density).toBe('comfortable');
    }
  });
});
