const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calendarDayStamp(value: string | Date): number | null {
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) {
      const stamp = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
      return Number.isFinite(stamp) ? stamp : null;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Which teaching week a plan is in today. Week 1 starts on the start date. */
export function currentTermWeek(termStart: string | null, now = new Date()): number {
  if (!termStart) return 1;
  const started = calendarDayStamp(termStart);
  const today = calendarDayStamp(now);
  if (started == null || today == null || today < started) return 1;
  const elapsedCalendarDays = Math.floor((today - started) / MS_PER_DAY);
  return Math.floor(elapsedCalendarDays / 7) + 1;
}

/** School plans prefer the term; duration programmes fall back to their delivery window. */
export function currentDeliveryWeek(input: {
  termStart?: string | null;
  periodStart?: string | null;
}, now = new Date()): number {
  return currentTermWeek(input.termStart ?? input.periodStart ?? null, now);
}

/** False until the term or duration period's start date (inclusive). */
export function calendarHasStarted(
  start: string | null | undefined,
  now = new Date(),
): boolean {
  if (!start) return true;
  const started = calendarDayStamp(start);
  const today = calendarDayStamp(now);
  if (started == null || today == null) return true;
  return today >= started;
}
