import { describe, expect, it } from 'vitest';
import { currentDeliveryWeek, currentTermWeek } from './week-generation';

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * The sweep advances a plan by asking which teaching week it is in. A school
 * plan counts from term_start; a duration programme has neither a term nor a
 * term_start, so counting from it returned week 1 for ever — the holiday
 * programme would have had week 1 rebuilt every night instead of moving on.
 */
describe('currentDeliveryWeek', () => {
  it('counts a school plan from its term start, as before', () => {
    expect(currentDeliveryWeek({ termStart: daysAgo(15) })).toBe(
      currentTermWeek(daysAgo(15)),
    );
  });

  it('counts a duration programme from its delivery window', () => {
    // Three weeks into the run, not week 1.
    expect(currentDeliveryWeek({ termStart: null, periodStart: daysAgo(15) })).toBe(3);
  });

  it('does not strand a duration plan on week 1', () => {
    const stranded = currentDeliveryWeek({ termStart: null, periodStart: null });
    const advancing = currentDeliveryWeek({ termStart: null, periodStart: daysAgo(30) });
    expect(stranded).toBe(1);
    expect(advancing).toBeGreaterThan(1);
  });

  it('prefers the term when a plan somehow carries both', () => {
    // A school plan is the authority on its own week; the period is the
    // fallback for plans that have no term at all.
    expect(currentDeliveryWeek({ termStart: daysAgo(7), periodStart: daysAgo(70) }))
      .toBe(currentTermWeek(daysAgo(7)));
  });

  it('reports week 1 before a programme has started', () => {
    const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(currentDeliveryWeek({ termStart: null, periodStart: future })).toBe(1);
  });

  it('survives an unparseable date rather than throwing', () => {
    expect(currentDeliveryWeek({ termStart: null, periodStart: 'not-a-date' })).toBe(1);
  });
});
