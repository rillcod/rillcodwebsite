import { describe, expect, it } from 'vitest';
import {
  capstoneForWeek,
  capstoneScope,
  capstoneSlots,
  levelBandFrom,
} from './project-cadence';

/**
 * The generator produced one project per week. For the eight-week term that 49
 * of 58 plans actually run, that is eight separate builds a term, none aware of
 * the others — and a learner ends the term with eight half-things.
 *
 * Two capstones, built up to. These tests pin the cadence and the scope,
 * because both are curriculum decisions rather than implementation details:
 * getting them wrong quietly changes what every class is asked to do.
 */

describe('two capstones a term, at the halfway point and the end', () => {
  it('places them at week 4 and week 8 in the real term length', () => {
    expect(capstoneSlots(8).map((s) => s.week)).toEqual([4, 8]);
  });

  it('makes the second one extend the first', () => {
    const [first, second] = capstoneSlots(8);
    expect(first.extendsPrevious).toBe(false);
    expect(second.extendsPrevious).toBe(true);
  });

  it('assembles each from the weeks that lead into it', () => {
    const [first, second] = capstoneSlots(8);
    // The run-up, not the hand-in week itself.
    expect(first.buildsOn).toEqual([1, 2, 3]);
    expect(second.buildsOn).toEqual([5, 6, 7]);
  });

  it('gives a short term one capstone, not two', () => {
    // Two builds inside three weeks is the weekly cadence with fewer weeks —
    // exactly what this replaces.
    expect(capstoneSlots(3).map((s) => s.week)).toEqual([3]);
    expect(capstoneSlots(2).map((s) => s.week)).toEqual([2]);
  });

  it('produces nothing for an empty plan', () => {
    expect(capstoneSlots(0)).toEqual([]);
  });

  it('answers whether a given week is a hand-in', () => {
    expect(capstoneForWeek(4, 8)?.index).toBe(1);
    expect(capstoneForWeek(8, 8)?.index).toBe(2);
    // The weeks between are the run-up. They carry teaching, not a hand-in.
    expect(capstoneForWeek(5, 8)).toBeNull();
    expect(capstoneForWeek(1, 8)).toBeNull();
  });
});

describe('scope follows the level', () => {
  it('reads the level out of a real class name', () => {
    expect(levelBandFrom('Gabus Basic · Young Innov · Basic 5')).toBe('basic');
    expect(levelBandFrom('Key to Success · Teen Dev · SS 1-3')).toBe('ss');
    expect(levelBandFrom('Megamind · Teen Dev · JSS 1-3')).toBe('jss');
  });

  it('falls to the gentlest scope when the name says nothing', () => {
    // A mis-read should under-ask, never hand a six-year-old a three-week build.
    expect(levelBandFrom(null)).toBe('basic');
    expect(levelBandFrom('Summer School 2026')).toBe('basic');
  });

  it('gives Basic 1 half an hour with a partner', () => {
    const scope = capstoneScope('basic', 1);
    expect(scope.minutes).toBe(30);
    expect(scope.grouping).toBe('pairs');
    expect(scope.spanWeeks).toBe(1);
  });

  it('gives SS a three-week build by the end of term', () => {
    const scope = capstoneScope('ss', 2);
    expect(scope.spanWeeks).toBe(3);
    expect(scope.grouping).toBe('individual');
  });

  it('makes the second capstone bigger than the first at every level', () => {
    for (const band of ['basic', 'jss', 'ss'] as const) {
      const first = capstoneScope(band, 1);
      const second = capstoneScope(band, 2);
      const weight = (s: typeof first) => s.spanWeeks * 1000 + (s.minutes ?? 0);
      expect(weight(second)).toBeGreaterThan(weight(first));
    }
  });
});
