import type { Json } from '@/types/supabase';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asWeekArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function getWeekNumber(week: Record<string, unknown>): number {
  return Number(week.week_number ?? week.week ?? 0);
}

function getYearTermFromWeek(
  week: Record<string, unknown>,
  fallbackYear?: number | null,
  fallbackTerm?: number | null,
) {
  const syllabusRef = asObject(week.syllabus_ref);
  const official = asObject(week.official_position);
  const year = Number(syllabusRef.year_number ?? official.programme_year ?? fallbackYear ?? 0);
  const term = Number(syllabusRef.term_number ?? official.programme_term ?? fallbackTerm ?? 0);
  return {
    year: Number.isFinite(year) && year > 0 ? year : null,
    term: Number.isFinite(term) && term > 0 ? term : null,
  };
}

export function getWeekCompositeKey(
  week: Record<string, unknown>,
  fallbackYear?: number | null,
  fallbackTerm?: number | null,
): string {
  const weekNumber = getWeekNumber(week);
  const session = Number(week.session ?? week.session_number ?? 0);
  const sessionPart =
    Number.isFinite(session) && session > 0 ? `s${Math.floor(session)}` : '';
  const { year, term } = getYearTermFromWeek(week, fallbackYear, fallbackTerm);
  if (year && term) return `y${year}t${term}w${weekNumber}${sessionPart}`;
  return `legacy:w${weekNumber}${sessionPart}`;
}

/** Session index on a plan row (1-based). Missing → 0 (legacy single-unit week). */
export function getPlanWeekSession(week: Record<string, unknown>): number {
  const session = Number(week.session ?? week.session_number ?? 0);
  return Number.isFinite(session) && session > 0 ? Math.floor(session) : 0;
}

/** Metadata fields that keep multi-session weeks distinct in generators. */
export function planWeekSessionMetadata(
  week: Record<string, unknown>,
): { session?: number; session_number?: number } {
  const session = getPlanWeekSession(week);
  if (session < 1) return {};
  return { session, session_number: session };
}

export function getMetadataWeekCompositeKey(
  metadata: Record<string, unknown> | null | undefined,
  fallbackYear?: number | null,
  fallbackTerm?: number | null,
): string {
  const m = asObject(metadata);
  return getWeekCompositeKey({
    week: Number(m.week_number ?? m.week ?? -1),
    session: Number(m.session ?? m.session_number ?? 0),
    syllabus_ref: {
      year_number: Number(m.year_number ?? fallbackYear ?? 0),
      term_number: Number(m.term_number ?? fallbackTerm ?? 0),
    },
  }, fallbackYear, fallbackTerm);
}

export function metadataMatchesWeek(
  metadata: Record<string, unknown> | null | undefined,
  week: Record<string, unknown>,
  fallbackYear?: number | null,
  fallbackTerm?: number | null,
): boolean {
  return getMetadataWeekCompositeKey(metadata, fallbackYear, fallbackTerm)
    === getWeekCompositeKey(week, fallbackYear, fallbackTerm);
}

export function extractLessonPlanOperationWeeks(
  planData: unknown,
): Array<Record<string, unknown>> {
  const root = asObject(planData);
  const progression = asObject(root.progression);
  const generatedTerms = asObject(progression.generated_terms);
  const fromGeneratedTerms = Object.entries(generatedTerms).flatMap(([key, termValue]) => {
    const match = key.match(/^y(\d+)t(\d+)$/);
    const fallbackYear = match ? Number(match[1]) : null;
    const fallbackTerm = match ? Number(match[2]) : null;
    return asWeekArray(asObject(termValue).weeks).map((week) => {
      const syllabusRef = asObject(week.syllabus_ref);
      return {
        ...week,
        syllabus_ref: {
          ...syllabusRef,
          year_number: Number(syllabusRef.year_number ?? fallbackYear ?? 0) || fallbackYear,
          term_number: Number(syllabusRef.term_number ?? fallbackTerm ?? 0) || fallbackTerm,
          week_number: Number(syllabusRef.week_number ?? week.week ?? 0) || Number(week.week ?? 0),
        },
      };
    });
  });

  if (fromGeneratedTerms.length > 0) {
    const unique = new Map<string, Record<string, unknown>>();
    for (const week of fromGeneratedTerms) {
      unique.set(getWeekCompositeKey(week), week);
    }
    return Array.from(unique.values()).sort((a, b) => {
      const aRef = getYearTermFromWeek(a);
      const bRef = getYearTermFromWeek(b);
      return (aRef.year ?? 0) - (bRef.year ?? 0)
        || (aRef.term ?? 0) - (bRef.term ?? 0)
        || getWeekNumber(a) - getWeekNumber(b)
        || getPlanWeekSession(a) - getPlanWeekSession(b);
    });
  }

  return asWeekArray(root.weeks).sort(
    (a, b) =>
      getWeekNumber(a) - getWeekNumber(b) ||
      getPlanWeekSession(a) - getPlanWeekSession(b),
  );
}

/**
 * Narrow plan rows to specific calendar weeks and/or one class meeting.
 * Untagged legacy rows count as Class 1.
 */
export function filterPlanOperationWeeks(
  weeks: Array<Record<string, unknown>>,
  input: {
    onlyWeeks?: number[] | null;
    onlySession?: number | null;
  },
): Array<Record<string, unknown>> {
  let rows = weeks;
  if (input.onlyWeeks?.length) {
    const set = new Set(input.onlyWeeks.map(Number));
    rows = rows.filter((w) => set.has(Number(w.week)));
  }
  const onlySession = Number(input.onlySession);
  if (Number.isFinite(onlySession) && onlySession > 0) {
    const want = Math.floor(onlySession);
    rows = rows.filter((w) => {
      const session = getPlanWeekSession(w);
      if (session > 0) return session === want;
      return want === 1;
    });
  }
  return rows;
}

export function parseWeekTermRefs(
  week: {
    syllabus_ref?: { year_number?: number; term_number?: number };
    official_position?: { programme_year?: number; programme_term?: number };
  },
  planTermNum: number,
  fallbackYear: number = 1,
): { yearNumber: number; termNumber: number; effectiveTermNum: number } {
  const yearNumber = Number(
    week.syllabus_ref?.year_number ?? week.official_position?.programme_year ?? fallbackYear,
  );
  const termNumber = Number(
    week.syllabus_ref?.term_number ?? week.official_position?.programme_term ?? planTermNum,
  );
  const effectiveTermNum = Number.isFinite(termNumber) && termNumber > 0 ? termNumber : planTermNum;
  return { yearNumber, termNumber, effectiveTermNum };
}

export function syncWeeksIntoProgression(
  currentPlanData: unknown,
  proposedWeeks: Array<Record<string, unknown>>,
): Json {
  const root = asObject(currentPlanData);
  const progression = asObject(root.progression);
  const generatedTerms = asObject(progression.generated_terms);
  const nextGeneratedTerms: Record<string, unknown> = { ...generatedTerms };

  for (const week of proposedWeeks) {
    const { year, term } = getYearTermFromWeek(week);
    if (!year || !term) continue;
    const key = `y${year}t${term}`;
    const termObj = asObject(nextGeneratedTerms[key]);
    const weeks = asWeekArray(termObj.weeks);
    const weekNumber = getWeekNumber(week);
    if (!Number.isFinite(weekNumber) || weekNumber <= 0) continue;
    const nextWeeks = weeks.map((existing) => (
      getWeekNumber(existing) === weekNumber
        ? { ...existing, ...week }
        : existing
    ));
    const exists = weeks.some((existing) => getWeekNumber(existing) === weekNumber);
    nextGeneratedTerms[key] = {
      ...termObj,
      weeks: exists ? nextWeeks : [...nextWeeks, week].sort((a, b) => getWeekNumber(a) - getWeekNumber(b)),
    };
  }

  return JSON.parse(JSON.stringify({
    ...root,
    weeks: proposedWeeks,
    progression: {
      ...progression,
      generated_terms: nextGeneratedTerms,
    },
  })) as Json;
}
