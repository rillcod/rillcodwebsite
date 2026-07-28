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

function clampInteger(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

export function termWeekOrdinal(term: number, week: number): number {
  return (clampInteger(term, 1, 3) - 1) * 12 + clampInteger(week, 1, 12);
}

export function absoluteCurriculumWeek(year: number, term: number, week: number): number {
  return (clampInteger(year, 1, 6) - 1) * 36 + termWeekOrdinal(term, week);
}

export function curriculumPositionFromAbsolute(absoluteWeek: number): CurriculumPosition {
  const normalized = clampInteger(absoluteWeek, 1, 216);
  const zero = normalized - 1;
  return {
    year: Math.floor(zero / 36) + 1,
    term: Math.floor((zero % 36) / 12) + 1,
    week: (zero % 12) + 1,
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
  if (elapsed < 0) elapsed += 36;

  // A week before the configured entry point in the same first-cycle term is
  // not active yet. Callers can use null to display "starts in Week N".
  if (
    clampInteger(input.calendarTerm, 1, 3) === clampInteger(input.schedule.entryTerm, 1, 3)
    && clampInteger(input.calendarWeek, 1, 12) < clampInteger(input.schedule.entryWeek, 1, 12)
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
