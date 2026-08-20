/**
 * One teaching identity for every pathway: calendar week + class meeting.
 *
 * Most teaching happens in a partner-school classroom. Rillcod publishes the
 * online timetable those classes follow, so attendance, generated lessons and
 * recorded student work stay on the same session for accountability. School
 * weeks store session_number = 1 and the teacher sees "Week 3". Programmes that
 * meet more than once in a calendar week use Class 1, 2, … on that timetable.
 */

export type SessionBearing = {
  metadata?: Record<string, unknown> | null;
  title?: string | null;
  session?: unknown;
  session_number?: unknown;
};

/** Normalize a raw request/plan value to a 1-based meeting, or null if absent. */
export function normalizeMeetingSession(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : null;
}

/** Stored identity: omitted or invalid values become meeting 1, matching the DB. */
export function canonicalMeetingSession(raw: unknown): number {
  return normalizeMeetingSession(raw) ?? 1;
}

function stampedSession(row: SessionBearing): unknown {
  const meta = row.metadata;
  return (
    row.session_number ??
    row.session ??
    (meta && typeof meta === "object"
      ? meta.session ?? meta.session_number
      : undefined)
  );
}

/**
 * Session on a generated asset. The session_number column is canonical;
 * metadata is only a read fallback for in-memory plan rows.
 */
export function assetMeetingSession(row: SessionBearing): number {
  return canonicalMeetingSession(stampedSession(row));
}

/** Same as assetMeetingSession — titles are not identity. */
export function assetStampedMeetingSession(row: SessionBearing): number {
  return assetMeetingSession(row);
}

/** Session on a plan week row. Untagged → meeting 1. */
export function planRowMeetingSession(row: SessionBearing): number {
  return assetMeetingSession(row);
}

/**
 * Parse session from API bodies that use any of:
 * session | session_number | only_session
 * Returns null when the caller omitted it so multi-meeting release can ask.
 */
export function parseRequestSession(
  body: Record<string, unknown> | null | undefined
): number | null {
  if (!body) return null;
  return normalizeMeetingSession(
    body.session ?? body.session_number ?? body.only_session
  );
}

/** Lookup key shared by workspace indexes and plan meeting lists. Always week:sN. */
export function meetingLookupKey(
  week: number,
  session?: number | null
): string {
  return `${week}:s${canonicalMeetingSession(session)}`;
}

/** Plan-meeting key always includes meeting N (untagged → 1). */
export function planMeetingLookupKey(
  week: number,
  session?: number | null
): string {
  return meetingLookupKey(week, session);
}

/**
 * Teacher-facing slot name.
 *
 * A physical school week is "Week 3". "Class 2" only appears when that
 * calendar week actually has more than one meeting, or the row itself is
 * meeting 2+.
 */
export function teachingMeetingLabel(
  week: number,
  session?: number | null,
  meetingsInWeek = 1
): string {
  const meeting = canonicalMeetingSession(session);
  if (meeting > 1 || meetingsInWeek > 1) {
    return `Week ${week} · Class ${meeting}`;
  }
  return `Week ${week}`;
}

export function teachingMeetingShortLabel(
  week: number,
  session?: number | null,
  meetingsInWeek = 1
): string {
  const meeting = canonicalMeetingSession(session);
  if (meeting > 1 || meetingsInWeek > 1) {
    return `W${week} · C${meeting}`;
  }
  return `W${week}`;
}
