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
  return Number(week.week ?? 0);
}

function getYearTermFromWeek(
  week: Record<string, unknown>,
  fallbackYear?: number | null,
  fallbackTerm?: number | null,
) {
  const syllabusRef = asObject(week.syllabus_ref);
  const year = Number(syllabusRef.year_number ?? fallbackYear ?? 0);
  const term = Number(syllabusRef.term_number ?? fallbackTerm ?? 0);
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
  const { year, term } = getYearTermFromWeek(week, fallbackYear, fallbackTerm);
  if (year && term) return `y${year}t${term}w${weekNumber}`;
  return `legacy:w${weekNumber}`;
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
        || getWeekNumber(a) - getWeekNumber(b);
    });
  }

  return asWeekArray(root.weeks).sort((a, b) => getWeekNumber(a) - getWeekNumber(b));
}

export function parseWeekTermRefs(
  week: { syllabus_ref?: { year_number?: number; term_number?: number } },
  planTermNum: number,
): { yearNumber: number; termNumber: number; effectiveTermNum: number } {
  const yearNumber = Number(week.syllabus_ref?.year_number ?? 0);
  const termNumber = Number(week.syllabus_ref?.term_number ?? planTermNum);
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
