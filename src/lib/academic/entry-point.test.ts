import { describe, expect, it } from 'vitest';
import {
  decideEntryPoint,
  fallbackScheduleRow,
  readDeliveryPosition,
} from './entry-point';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe('recording where a school joined', () => {
  it('never touches a schedule someone already set', () => {
    // A person choosing an entry point on the Rollout screen outranks anything
    // inferred here. Re-deriving it would overwrite their decision on the next
    // sweep, on a schedule nobody is watching.
    const decision = decideEntryPoint({
      existingSchedule: { id: 'sched-1', entry_term_number: 3 },
      term: { term_number: 1, start_date: daysAgo(7) },
    });
    expect(decision).toEqual({
      create: false,
      reason: 'A delivery schedule already exists for this scope.',
    });
  });

  it('records a mid-year joiner at the term they actually walked in', () => {
    // The live case: a school onboarded during Third Term. Its own Programme
    // Term 1 is that Third Term, and it starts the curriculum at week one.
    const decision = decideEntryPoint({
      existingSchedule: null,
      term: { term_number: 3, start_date: daysAgo(14) },
    });
    expect(decision).toMatchObject({
      create: true,
      entry_term_number: 3,
      curriculum_year_number: 1,
      curriculum_term_number: 1,
      curriculum_week_number: 1,
    });
  });

  it('counts the entry week from the term start, not from week one', () => {
    // Joining in week 3 must say week 3. Recording week 1 would claim two weeks
    // of teaching that never happened and mark the school behind from day one.
    const decision = decideEntryPoint({
      existingSchedule: null,
      term: { term_number: 1, start_date: daysAgo(15) },
    });
    expect(decision.create).toBe(true);
    if (!decision.create) return;
    expect(decision.entry_week_number).toBeGreaterThan(1);
  });

  it('starts a school joining on day one at week one', () => {
    const decision = decideEntryPoint({
      existingSchedule: null,
      term: { term_number: 2, start_date: new Date().toISOString() },
    });
    expect(decision).toMatchObject({ create: true, entry_term_number: 2, entry_week_number: 1 });
  });

  it('treats a term that has not started yet as week one', () => {
    const decision = decideEntryPoint({
      existingSchedule: null,
      term: { term_number: 1, start_date: new Date(Date.now() + 7 * 864e5).toISOString() },
    });
    expect(decision).toMatchObject({ create: true, entry_week_number: 1 });
  });

  it('refuses to guess when there is no term at all', () => {
    // Defaulting to First Term would assert something untrue about when the
    // school joined, and that assertion drives what every class is taught.
    expect(decideEntryPoint({ existingSchedule: null, term: null }))
      .toEqual({
        create: false,
        reason: 'This class has no academic term to derive an entry point from.',
      });
  });

  it('falls back to the release term when the class has none', () => {
    expect(decideEntryPoint({ existingSchedule: null, term: null, releaseEffectiveTerm: 2 }))
      .toMatchObject({ create: true, entry_term_number: 2 });
  });

  it('rejects a term number outside the school year', () => {
    expect(decideEntryPoint({ existingSchedule: null, term: { term_number: 7 } }).create).toBe(false);
  });
});

describe('reading a delivery schedule', () => {
  /**
   * These replaced three inline copies. The copies had drifted: two spellings
   * of the same coercion, one of which let NaN through into week arithmetic.
   */

  it('reads a real row as plain numbers', () => {
    expect(
      readDeliveryPosition({
        entry_term_number: 3,
        entry_week_number: 5,
        curriculum_year_number: 2,
        curriculum_term_number: 1,
        curriculum_week_number: 4,
      }),
    ).toEqual({
      entryTerm: 3,
      entryWeek: 5,
      curriculumYear: 2,
      curriculumTerm: 1,
      curriculumWeek: 4,
    });
  });

  it('never returns NaN — the bug the old ?? spelling allowed', () => {
    // Number('later') is NaN, and `?? 1` does not replace NaN. That value used
    // to travel into week arithmetic and produce a plan with NaN weeks rather
    // than an obvious failure.
    const position = readDeliveryPosition({
      entry_term_number: 'later',
      entry_week_number: undefined,
      curriculum_year_number: null,
    });
    for (const value of Object.values(position)) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(position.entryTerm).toBe(1);
  });

  it('treats zero and negatives as unset, not as real positions', () => {
    // There is no term zero and no week zero; letting one through reads as a
    // real position downstream.
    const position = readDeliveryPosition({ entry_term_number: 0, entry_week_number: -4 });
    expect(position.entryTerm).toBe(1);
    expect(position.entryWeek).toBe(1);
  });

  it('handles a missing schedule entirely', () => {
    expect(readDeliveryPosition(null)).toEqual({
      entryTerm: 1,
      entryWeek: 1,
      curriculumYear: 1,
      curriculumTerm: 1,
      curriculumWeek: 1,
    });
    expect(readDeliveryPosition(undefined).entryTerm).toBe(1);
  });
});

describe('the fallback row', () => {
  it('starts the curriculum at the beginning even for a late joiner', () => {
    // Arriving in Third Term does not mean the children skip the first weeks:
    // only the calendar entry point moves. Same rule as decideEntryPoint.
    const row = fallbackScheduleRow({ entryTerm: 3 });
    expect(row.entry_term_number).toBe(3);
    expect(row.curriculum_year_number).toBe(1);
    expect(row.curriculum_term_number).toBe(1);
    expect(row.curriculum_week_number).toBe(1);
    expect(row.entry_week_number).toBe(1);
  });

  it('lets a caller target a specific programme year', () => {
    expect(fallbackScheduleRow({ entryTerm: 1, curriculumYear: 2 }).curriculum_year_number).toBe(2);
  });

  it('defaults to first term when nothing is known', () => {
    expect(fallbackScheduleRow({}).entry_term_number).toBe(1);
    expect(fallbackScheduleRow({ entryTerm: null }).entry_term_number).toBe(1);
  });

  it('round-trips through readDeliveryPosition', () => {
    // The two halves must agree, or a fallback would read back as something
    // different from what it was built to say.
    const row = fallbackScheduleRow({ entryTerm: 2, curriculumYear: 3 });
    const position = readDeliveryPosition(row);
    expect(position.entryTerm).toBe(2);
    expect(position.curriculumYear).toBe(3);
  });
});
