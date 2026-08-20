import { createAdminClient } from "@/lib/supabase/admin";
import {
  assetStampedMeetingSession,
  normalizeMeetingSession,
  type SessionBearing,
} from "@/lib/academic/session-identity";

/**
 * One release path for prepared teaching — Regular School and Special Programme.
 *
 * School: assets have no class-meeting stamp → release the whole calendar week.
 * Special (1 class/week): may stamp session:1 → we infer that single meeting when
 * the caller omits session, so "Release week" keeps working.
 * Special (2+ classes/week): pass `session` so Class 1 never activates Class 2.
 */
export type WeekReleaseResult = {
  planId: string;
  week: number;
  session: number | null;
  lessons_released: number;
  assignments_released: number;
  flashcards_released: number;
  error?: string;
  /** Multiple class meetings are held and the caller must name one. */
  needs_session?: boolean;
  /** Class meetings available to release when needs_session is true. */
  available_sessions?: number[];
};

type SessionRow = SessionBearing;

/** @deprecated Prefer assetStampedMeetingSession for release — kept as alias. */
export function releaseAssetSession(row: SessionRow): number {
  return assetStampedMeetingSession(row);
}

/** @deprecated Prefer normalizeMeetingSession. */
export function normalizeReleaseSession(
  session: number | null | undefined,
): number | null {
  return normalizeMeetingSession(session);
}

/**
 * Resolve which class meeting this release targets.
 *
 * Explicit session always wins. Otherwise:
 * - no stamped sessions → school week (null = all unscoped rows)
 * - exactly one stamped session → that meeting (1-class special programmes)
 * - two or more → null (caller must pass session; never guess)
 */
export function resolveEffectiveReleaseSession(
  heldRows: SessionRow[],
  requested: number | null | undefined,
): number | null {
  const explicit = normalizeReleaseSession(requested);
  if (explicit != null) return explicit;

  const sessions = new Set<number>();
  for (const row of heldRows) {
    const s = assetStampedMeetingSession(row);
    if (s > 0) sessions.add(s);
  }
  if (sessions.size === 1) return [...sessions][0] ?? null;
  return null;
}

/**
 * Decide if a held row belongs to this release.
 *
 * - Explicit / inferred session: that meeting only (unscoped ≡ session 1).
 * - No session (school week): every held row — titles with "Session N" are ignored.
 */
export function matchesReleaseSession(
  row: SessionRow,
  session: number | null | undefined,
): boolean {
  const got = assetStampedMeetingSession(row);
  const want = normalizeMeetingSession(session);
  if (want != null) {
    if (got < 1) return want === 1;
    return got === want;
  }
  return true;
}

export async function releasePreparedWeek(input: {
  planId: string;
  week: number;
  /** Class meeting within the week (1-based). Required when 2+ meetings exist. */
  session?: number | null;
  now?: string;
}): Promise<WeekReleaseResult> {
  const db = createAdminClient();
  const now = input.now ?? new Date().toISOString();
  const { planId, week } = input;

  const empty = (session: number | null, error?: string): WeekReleaseResult => ({
    planId,
    week,
    session,
    lessons_released: 0,
    assignments_released: 0,
    flashcards_released: 0,
    ...(error ? { error } : {}),
  });

  const [{ data: draftLessons, error: lessonSelectError }, { data: heldAssignments, error: assignmentSelectError }, decksRes] =
    await Promise.all([
      db
        .from("lessons")
        .select("id,metadata,title,status,session_number")
        .eq("lesson_plan_id", planId)
        .eq("curriculum_week_number", week)
        .eq("status", "draft"),
      db
        .from("assignments")
        .select("id,metadata,title,is_active,session_number")
        .eq("lesson_plan_id", planId)
        .eq("curriculum_week_number", week)
        .eq("is_active", false),
      (db as any)
        .from("flashcard_decks")
        .select("id,title,lesson_id,is_public,session_number")
        .eq("lesson_plan_id", planId)
        .eq("curriculum_week_number", week)
        .eq("is_public", false),
    ]);

  if (lessonSelectError) return empty(normalizeReleaseSession(input.session), lessonSelectError.message);
  if (assignmentSelectError) {
    return empty(normalizeReleaseSession(input.session), assignmentSelectError.message);
  }

  const heldDecks = (decksRes?.data ?? []) as Array<{
    id: string;
    title?: string | null;
    lesson_id?: string | null;
    session_number?: number | null;
  }>;
  const deckSelectError = decksRes?.error as { message: string } | null;
  if (deckSelectError) {
    return empty(normalizeReleaseSession(input.session), deckSelectError.message);
  }

  const probeRows: SessionRow[] = [
    ...(draftLessons ?? []).map((row: any) => ({
      metadata: row.metadata as Record<string, unknown> | null,
      title: row.title,
      session_number: row.session_number,
    })),
    ...(heldAssignments ?? []).map((row: any) => ({
      metadata: row.metadata as Record<string, unknown> | null,
      title: row.title,
      session_number: row.session_number,
    })),
    ...heldDecks.map((row) => ({
      title: row.title,
      session_number: row.session_number,
    })),
  ];

  const session = resolveEffectiveReleaseSession(probeRows, input.session);

  // Two or more metadata-stamped meetings and no explicit session: the caller
  // must pick a class meeting instead of releasing nothing or a random subset.
  if (session == null && normalizeReleaseSession(input.session) == null) {
    const stamped = [
      ...new Set(
        probeRows.map((row) => assetStampedMeetingSession(row)).filter((s) => s > 0),
      ),
    ].sort((a, b) => a - b);
    if (stamped.length >= 2) {
      return {
        ...empty(null),
        needs_session: true,
        available_sessions: stamped,
        error: `Week ${week} has ${stamped.length} class meetings held for review. Choose which class meeting to release (Class ${stamped.join(', Class ')}).`,
      };
    }
  }

  const { data: released, error: releaseError } = await (db as any).rpc(
    "release_prepared_week_atomic",
    {
      p_lesson_plan_id: planId,
      p_week_number: week,
      p_session_number: session,
      p_released_at: now,
    }
  );
  if (releaseError) return empty(session, releaseError.message);

  const payload = (released ?? {}) as {
    lessons_released?: number;
    assignments_released?: number;
    flashcards_released?: number;
    assignment_ids?: string[];
  };
  const assignmentIds = Array.isArray(payload.assignment_ids)
    ? payload.assignment_ids.filter(Boolean)
    : [];

  // Notifications are side effects after the visibility transaction commits.
  // A provider outage cannot roll learner visibility back or leave a half-live
  // package; the normal notification retry path can recover separately.
  if (assignmentIds.length > 0) {
    const { triggerAssignmentReleaseNotifications } = await import(
      "@/lib/assignments/notifications"
    );
    void Promise.all(
      assignmentIds.map((assignmentId) =>
        triggerAssignmentReleaseNotifications(assignmentId).catch(console.error)
      )
    );
  }

  return {
    planId,
    week,
    session,
    lessons_released: Number(payload.lessons_released) || 0,
    assignments_released: Number(payload.assignments_released) || 0,
    flashcards_released: Number(payload.flashcards_released) || 0,
  };
}
