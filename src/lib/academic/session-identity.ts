/**
 * One session/week identity model for school and special-programme teaching.
 *
 * - School weeks are usually unscoped (session = null / 0).
 * - Special programmes stamp Class N as metadata.session (1-based).
 * - Plan rows without a session default to Class 1 for generation scheduling.
 * - Asset rows without a session stay unscoped (0) for school-style release.
 */

export type SessionBearing = {
  metadata?: Record<string, unknown> | null;
  title?: string | null;
  session?: unknown;
  session_number?: unknown;
};

/** Normalize a raw request/plan value to a 1-based meeting, or null. */
export function normalizeMeetingSession(
  raw: unknown,
): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Session stamped on a generated asset (metadata preferred, then title).
 * Returns 0 when the asset is unscoped (typical school week).
 */
export function assetMeetingSession(row: SessionBearing): number {
  const meta = row.metadata;
  if (meta) {
    const fromMeta = normalizeMeetingSession(meta.session ?? meta.session_number);
    if (fromMeta != null) return fromMeta;
  }
  const fromFields = normalizeMeetingSession(row.session ?? row.session_number);
  if (fromFields != null) return fromFields;
  const title = String(row.title || '');
  const m = title.match(/Session\s+(\d+)/i);
  if (m) {
    const n = normalizeMeetingSession(m[1]);
    if (n != null) return n;
  }
  return 0;
}

/** Session on a plan week row. Untagged → 0 (caller chooses default). */
export function planRowMeetingSession(row: SessionBearing): number {
  return (
    normalizeMeetingSession(row.session ?? row.session_number) ??
    normalizeMeetingSession(row.metadata?.session ?? row.metadata?.session_number) ??
    0
  );
}

/**
 * Parse session from API bodies that use any of:
 * session | only_session | session_number
 */
export function parseRequestSession(
  body: Record<string, unknown> | null | undefined,
): number | null {
  if (!body) return null;
  return normalizeMeetingSession(
    body.session ?? body.only_session ?? body.session_number,
  );
}

/** Lookup key shared by workspace indexes and plan meeting lists. */
export function meetingLookupKey(
  week: number,
  session?: number | null,
  opts?: { untaggedAs?: 0 | 1 },
): string {
  const untaggedAs = opts?.untaggedAs ?? 0;
  const s = normalizeMeetingSession(session);
  if (s != null) return `${week}:s${s}`;
  if (untaggedAs === 1) return `${week}:s1`;
  return `${week}`;
}

/** Plan-meeting key always includes Class N (untagged → Class 1). */
export function planMeetingLookupKey(week: number, session?: number | null): string {
  return meetingLookupKey(week, session, { untaggedAs: 1 });
}
