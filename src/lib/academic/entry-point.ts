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

/* ── Reading a delivery schedule ─────────────────────────────────────────────
 *
 * decideEntryPoint above answers "should we record one, and what does it say".
 * Everything below answers the other half: given a schedule row that may or may
 * not exist, where is this class actually sitting?
 *
 * That half was written three times — teaching-workspace, curriculum-governance
 * direction, and lesson-plans each built the same fallback row inline and then
 * coerced it back out. The copies had already drifted:
 *
 *   teaching-workspace   Number(schedule.entry_term_number) || 1
 *   direction            Number(rawSchedule.entry_term_number ?? 1)
 *
 * The second is the weaker form. `??` only replaces null and undefined, so a
 * non-numeric value becomes NaN and travels on into week arithmetic, where it
 * produces a plan with NaN weeks rather than an obvious failure. Both spellings
 * are collapsed here into the safer one.
 */

/** A delivery schedule as the rest of the app wants to read it. */
export type DeliveryPosition = {
  /** Calendar term the school entered at (1-3). */
  entryTerm: number;
  /** Week within that term (1-based). */
  entryWeek: number;
  /** Where in the curriculum they start: year, term, week. */
  curriculumYear: number;
  curriculumTerm: number;
  curriculumWeek: number;
};

/** The row shape stored in academic_curriculum_delivery_schedules. */
export type DeliveryScheduleRow = {
  entry_term_number: number;
  entry_week_number: number;
  curriculum_year_number: number;
  curriculum_term_number: number;
  curriculum_week_number: number;
};

/**
 * A positive whole number, or the fallback.
 *
 * Rejects NaN, 0 and negatives together: a term is 1-3 and a week is 1-based,
 * so none of them is a real value, and letting a 0 through reads as "term zero"
 * downstream rather than "unset".
 */
function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * The row to use when a school has no delivery schedule of its own.
 *
 * Curriculum position defaults to the very beginning: arriving in Third Term
 * does not mean the children skip the first weeks. Only the calendar entry
 * point moves, which is the same rule decideEntryPoint records.
 */
export function fallbackScheduleRow(input: {
  /** The class's calendar term, or the release's effective term. */
  entryTerm?: number | null;
  /** Overridden only where a caller is targeting a specific programme year. */
  curriculumYear?: number | null;
}): DeliveryScheduleRow {
  return {
    entry_term_number: positiveInt(input.entryTerm, 1),
    entry_week_number: 1,
    curriculum_year_number: positiveInt(input.curriculumYear, 1),
    curriculum_term_number: 1,
    curriculum_week_number: 1,
  };
}

/**
 * Read a schedule row — real or fallback — into plain numbers.
 *
 * Never throws and never returns NaN, so callers can do week arithmetic on the
 * result without re-checking every field.
 */
export function readDeliveryPosition(schedule: unknown): DeliveryPosition {
  const row = (schedule ?? {}) as Partial<DeliveryScheduleRow>;
  return {
    entryTerm: positiveInt(row.entry_term_number, 1),
    entryWeek: positiveInt(row.entry_week_number, 1),
    curriculumYear: positiveInt(row.curriculum_year_number, 1),
    curriculumTerm: positiveInt(row.curriculum_term_number, 1),
    curriculumWeek: positiveInt(row.curriculum_week_number, 1),
  };
}
