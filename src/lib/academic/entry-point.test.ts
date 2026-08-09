import { describe, expect, it } from 'vitest';
import { decideEntryPoint } from './entry-point';

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
