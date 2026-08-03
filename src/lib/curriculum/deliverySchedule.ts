export type CurriculumPosition = {
  year: number;
  term: number;
  week: number;
  absoluteWeek: number;
};

export type DeliverySchedule = {
  entryTerm: number;
  entryWeek: number;
  curriculumYear?: number;
  curriculumTerm?: number;
  curriculumWeek?: number;
};

/**
 * TERM_WEEK_STRIDE is the spacing between terms in this coordinate system. It
 * is NOT a claim that a term is that many weeks long.
 *
 * Positions are turned into a single ordinal so that "three weeks after Term 3
 * Week 3" can be worked out with arithmetic across term and year boundaries.
 * Terms advance by term, not by accumulated weeks, so a shorter term simply
 * leaves unused numbers in the gap and every relative answer stays correct.
 *
 * What the stride does bound is the longest term the system can represent:
 * a week beyond it clamps, and two different weeks would then share one
 * ordinal. It was 12, which silently collapsed weeks 13+ — and a Nigerian term
 * commonly runs to 13. The value below carries real term lengths with room to
 * spare. Nothing persists an absolute ordinal, so it is safe to widen.
 */
export const TERM_WEEK_STRIDE = 20;
export const TERMS_PER_YEAR = 3;
export const MAX_CURRICULUM_YEARS = 6;

const WEEKS_PER_YEAR = TERMS_PER_YEAR * TERM_WEEK_STRIDE;
const MAX_ABSOLUTE_WEEK = MAX_CURRICULUM_YEARS * WEEKS_PER_YEAR;

function clampInteger(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

export function termWeekOrdinal(term: number, week: number): number {
  return (
    (clampInteger(term, 1, TERMS_PER_YEAR) - 1) * TERM_WEEK_STRIDE +
    clampInteger(week, 1, TERM_WEEK_STRIDE)
  );
}

export function absoluteCurriculumWeek(year: number, term: number, week: number): number {
  return (
    (clampInteger(year, 1, MAX_CURRICULUM_YEARS) - 1) * WEEKS_PER_YEAR +
    termWeekOrdinal(term, week)
  );
}

export function curriculumPositionFromAbsolute(absoluteWeek: number): CurriculumPosition {
  const normalized = clampInteger(absoluteWeek, 1, MAX_ABSOLUTE_WEEK);
  const zero = normalized - 1;
  return {
    year: Math.floor(zero / WEEKS_PER_YEAR) + 1,
    term: Math.floor((zero % WEEKS_PER_YEAR) / TERM_WEEK_STRIDE) + 1,
    week: (zero % TERM_WEEK_STRIDE) + 1,
    absoluteWeek: normalized,
  };
}

/**
 * Resolve a school's local calendar term/week to the canonical curriculum
 * position. The local academic year wraps after Term 3 Week 12, while the
 * canonical sequence advances into its next curriculum year.
 */
export function mapCalendarToCurriculumPosition(input: {
  calendarTerm: number;
  calendarWeek: number;
  schedule: DeliverySchedule;
}): CurriculumPosition | null {
  const entry = termWeekOrdinal(input.schedule.entryTerm, input.schedule.entryWeek);
  const calendar = termWeekOrdinal(input.calendarTerm, input.calendarWeek);
  let elapsed = calendar - entry;
  if (elapsed < 0) elapsed += WEEKS_PER_YEAR;

  // A week before the configured entry point in the same first-cycle term is
  // not active yet. Callers can use null to display "starts in Week N".
  if (
    clampInteger(input.calendarTerm, 1, TERMS_PER_YEAR) ===
      clampInteger(input.schedule.entryTerm, 1, TERMS_PER_YEAR) &&
    clampInteger(input.calendarWeek, 1, TERM_WEEK_STRIDE) <
      clampInteger(input.schedule.entryWeek, 1, TERM_WEEK_STRIDE)
  ) return null;

  const base = absoluteCurriculumWeek(
    input.schedule.curriculumYear ?? 1,
    input.schedule.curriculumTerm ?? 1,
    input.schedule.curriculumWeek ?? 1,
  );
  return curriculumPositionFromAbsolute(base + elapsed);
}

export function effectiveDeliverySchedule<T extends DeliverySchedule>(input: {
  schoolDefault?: T | null;
  classOverride?: T | null;
}): T | null {
  return input.classOverride ?? input.schoolDefault ?? null;
}
