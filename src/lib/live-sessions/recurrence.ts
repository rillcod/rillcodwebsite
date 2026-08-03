/**
 * Recurrence for live-session series ("every Mon/Tue/Thu at 20:00").
 *
 * Pure on purpose — no Supabase, no clock of its own. Every date decision in the feature is
 * made here so it can be tested against real calendars rather than discovered in production
 * when a class materialises an hour late.
 *
 * The awkward part is that a series stores a WALL-CLOCK time ("20:00") plus a timezone, not
 * an instant. 20:00 must stay 20:00 for the school regardless of where the server runs, so
 * every occurrence is resolved through the target zone rather than the host's local offset.
 */

/** 0 = Sunday … 6 = Saturday, matching JS `Date.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const DEFAULT_TIMEZONE = 'Africa/Lagos';

export interface SeriesPattern {
  weekdays: number[];
  /** 'HH:MM' wall-clock in `timezone`. */
  start_time: string;
  timezone?: string | null;
  duration_minutes?: number | null;
}

export interface SeriesWindow {
  /** Academic term bounds, when the series is term-bound. */
  term_start?: string | null;
  term_end?: string | null;
  /** Explicit bounds — how a special programme carries its own calendar. */
  starts_on?: string | null;
  ends_on?: string | null;
}

/** A date with no time component, in the series' own timezone. */
export interface CalendarDate { year: number; month: number; day: number }

// ── Timezone plumbing ────────────────────────────────────────────────────────

/**
 * How far `timeZone` is ahead of UTC at the given instant, in ms.
 * Uses Intl rather than a date library — this is the one calculation that must be right,
 * and shipping a dependency for it would be worse than 8 lines we can test.
 */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
  // `hour` can come back as '24' at midnight in some ICU versions.
  const hour = Number(parts.hour) % 24;
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second),
  );
  return asIfUtc - at.getTime();
}

/**
 * The UTC instant of a wall-clock date+time in `timeZone`.
 * Two passes: the first guesses the offset from the naive instant, the second corrects it
 * using an instant that is already close — which is what makes DST boundaries land right.
 */
export function zonedWallClockToUtc(
  date: CalendarDate,
  hours: number,
  minutes: number,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, hours, minutes, 0, 0);
  let ts = naive - zoneOffsetMs(new Date(naive), timeZone);
  ts = naive - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

/** Parse 'HH:MM'. Returns null rather than throwing — a bad row must not kill the whole cron. */
export function parseStartTime(value: string | null | undefined): { hours: number; minutes: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!m) return null;
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

/** 'YYYY-MM-DD' → CalendarDate, or null. Accepts a full ISO timestamp too. */
export function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toUtcMidnight(d: CalendarDate): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

function fromUtcMidnight(ts: number): CalendarDate {
  const d = new Date(ts);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// ── Window resolution ────────────────────────────────────────────────────────

/**
 * The effective date range a series may generate into.
 *
 * A regular school programme is bounded by its academic term. A special programme (summer
 * school, holiday intensive) has no term and carries `starts_on`/`ends_on` itself. When both
 * are present the window is their INTERSECTION — a term-bound series that also names dates
 * must not spill outside the term.
 *
 * Returns null when the constraints cannot produce any day at all.
 */
export function resolveSeriesWindow(window: SeriesWindow): { start: CalendarDate; end: CalendarDate } | null {
  const candidatesStart = [parseCalendarDate(window.term_start), parseCalendarDate(window.starts_on)]
    .filter((d): d is CalendarDate => !!d);
  const candidatesEnd = [parseCalendarDate(window.term_end), parseCalendarDate(window.ends_on)]
    .filter((d): d is CalendarDate => !!d);

  // Latest start, earliest end — the intersection.
  const startTs = candidatesStart.length ? Math.max(...candidatesStart.map(toUtcMidnight)) : null;
  const endTs = candidatesEnd.length ? Math.min(...candidatesEnd.map(toUtcMidnight)) : null;

  // An unbounded end is refused: the DB requires term_id or ends_on precisely so no series
  // can generate forever, and this is the code-side half of that guarantee.
  if (endTs === null) return null;
  if (startTs !== null && startTs > endTs) return null;

  return {
    start: fromUtcMidnight(startTs ?? endTs),
    end: fromUtcMidnight(endTs),
  };
}

// ── Occurrence generation ────────────────────────────────────────────────────

export interface OccurrenceOptions {
  /** Only generate occurrences at or after this instant (normally "now"). */
  from: Date;
  /** Stop at this instant — the materialisation horizon. */
  until: Date;
  /** Safety valve so a misconfigured series can never flood the calendar in one run. */
  max?: number;
}

export const MAX_OCCURRENCES_PER_RUN = 200;

/**
 * Every occurrence instant of `pattern` inside `window`, clipped to [from, until].
 *
 * Walks calendar days in the series' own timezone rather than adding 24h repeatedly, because
 * "the same wall-clock time tomorrow" is not always 24 hours later.
 */
export function generateOccurrences(
  pattern: SeriesPattern,
  window: SeriesWindow,
  options: OccurrenceOptions,
): Date[] {
  const time = parseStartTime(pattern.start_time);
  if (!time) return [];

  const days = new Set(
    (pattern.weekdays ?? [])
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  );
  if (days.size === 0) return [];

  const resolved = resolveSeriesWindow(window);
  if (!resolved) return [];

  const zone = pattern.timezone || DEFAULT_TIMEZONE;
  const max = options.max ?? MAX_OCCURRENCES_PER_RUN;
  const fromTs = options.from.getTime();
  const untilTs = options.until.getTime();
  if (untilTs < fromTs) return [];

  const out: Date[] = [];
  const endTs = toUtcMidnight(resolved.end);
  // Start scanning a day early: an occurrence late on the previous local day can still fall
  // inside the requested range once the zone offset is applied.
  let cursor = toUtcMidnight(resolved.start) - 86_400_000;

  while (cursor <= endTs + 86_400_000 && out.length < max) {
    const day = fromUtcMidnight(cursor);
    cursor += 86_400_000;

    // Weekday of this calendar date (UTC midnight is safe — we only need the day index).
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    if (!days.has(weekday)) continue;

    // Re-check bounds: the pre/post padding above may have stepped outside the window.
    const dayTs = toUtcMidnight(day);
    if (dayTs < toUtcMidnight(resolved.start) || dayTs > endTs) continue;

    const at = zonedWallClockToUtc(day, time.hours, time.minutes, zone);
    const ts = at.getTime();
    if (ts < fromTs || ts > untilTs) continue;
    out.push(at);
  }

  return out;
}

/** "Mon, Tue & Thu at 20:00" — for cards, confirmations and notification copy. */
export function describePattern(pattern: SeriesPattern): string {
  const days = [...new Set((pattern.weekdays ?? []).map(Number))]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (days.length === 0) return 'No days selected';

  const time = parseStartTime(pattern.start_time);
  const at = time ? ` at ${pattern.start_time}` : '';

  if (days.length === 7) return `Every day${at}`;
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return `Weekdays${at}`;

  const labels = days.map((d) => WEEKDAY_LABELS[d]);
  const list = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
  return `${list}${at}`;
}
