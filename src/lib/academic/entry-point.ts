/**
 * Where a school actually joined, recorded automatically.
 *
 * The session-aware mapping already gives every school its own pathway: a
 * school entering in Third Term is taught Programme Term 1 that term, Programme
 * Term 2 the following First Term, and so on, while a school that started in
 * First Term is two terms further along the same curriculum. Two schools sitting
 * in the same calendar week are taught different weeks, and nothing is reported
 * overdue before a school's entry point.
 *
 * All of that reads one row: the school's delivery schedule. Only one code path
 * ever created one — a person, on the Rollout screen — so across 58 adoptions
 * exactly one row existed. Every other school fell back to defaults, and a
 * mid-year joiner was silently taught as though it had been there since the
 * start of the term.
 *
 * The readiness automation already computes this exact fallback in memory on
 * every run and then throws it away. This turns that throwaway into a record.
 *
 * THE RULE THAT MATTERS: create only when absent, never update. An entry point
 * is a historical fact — the term a school walked in. Recomputing it later would
 * move it to today and shift every week the school has already been taught,
 * silently, on a schedule nobody was watching.
 */

import { currentTermWeek } from '@/lib/academic/week-generation';
import { TERM_WEEK_STRIDE } from '@/lib/curriculum/deliverySchedule';

export type EntryPointDecision =
  | { create: false; reason: string }
  | {
      create: true;
      entry_term_number: number;
      entry_week_number: number;
      curriculum_year_number: number;
      curriculum_term_number: number;
      curriculum_week_number: number;
    };

export type EntryPointInput = {
  /** An existing schedule for this school+course+release, if any. */
  existingSchedule: unknown;
  /** The class's academic term — the calendar it actually runs on. */
  term: { term_number?: number | null; start_date?: string | null } | null;
  /** Fallback when the class has no term row: the release's effective term. */
  releaseEffectiveTerm?: number | null;
  /** Injected so the decision is testable without freezing the clock. */
  now?: Date;
};

/**
 * Decide whether to record an entry point, and what it should say.
 *
 * A school joining now enters at the live calendar position — that is what
 * "joined mid-term" means — and starts the curriculum at its beginning, because
 * arriving late does not mean the children skip the first weeks. That second
 * half is the reassuring case and by far the common one.
 */
export function decideEntryPoint(input: EntryPointInput): EntryPointDecision {
  // Never touch a schedule someone has already set. A person choosing an entry
  // point on the Rollout screen outranks anything inferred here, and re-deriving
  // it would overwrite their decision on the next sweep.
  if (input.existingSchedule) {
    return { create: false, reason: 'A delivery schedule already exists for this scope.' };
  }

  const termNumber = Number(input.term?.term_number ?? input.releaseEffectiveTerm ?? 0);
  if (!Number.isInteger(termNumber) || termNumber < 1 || termNumber > 3) {
    // Without a term there is no calendar to place the school on, and guessing
    // First Term would assert something untrue about when they joined.
    return { create: false, reason: 'This class has no academic term to derive an entry point from.' };
  }

  const startDate = input.term?.start_date ?? null;
  const week = startDate
    ? Math.max(1, Math.min(TERM_WEEK_STRIDE, currentTermWeek(startDate)))
    : 1;

  return {
    create: true,
    entry_term_number: termNumber,
    entry_week_number: week,
    // The start of the curriculum. A school arriving in Third Term still begins
    // at Year 1, First Term, Week 1 — its own Programme Term 1.
    curriculum_year_number: 1,
    curriculum_term_number: 1,
    curriculum_week_number: 1,
  };
}
