import { createAdminClient } from "@/lib/supabase/admin";
import {
  assetMeetingSession,
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
};

type SessionRow = SessionBearing;

/** @deprecated Prefer assetMeetingSession — kept as a stable release alias. */
export function releaseAssetSession(row: SessionRow): number {
  return assetMeetingSession(row);
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
    const s = assetMeetingSession(row);
    if (s > 0) sessions.add(s);
  }
  if (sessions.size === 1) return [...sessions][0] ?? null;
  return null;
}

/**
 * Decide if a held row belongs to this release.
 *
 * - Explicit / inferred session: that meeting only (unscoped ≡ session 1).
 * - No session (school or ambiguous multi-class): only unscoped rows.
 */
export function matchesReleaseSession(
  row: SessionRow,
  session: number | null | undefined,
): boolean {
  const got = assetMeetingSession(row);
  const want = normalizeMeetingSession(session);
  if (want != null) {
    if (got < 1) return want === 1;
    return got === want;
  }
  return got < 1;
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
        .select("id,metadata,title,status")
        .eq("lesson_plan_id", planId)
        .eq("curriculum_week_number", week)
        .eq("status", "draft"),
      db
        .from("assignments")
        .select("id,metadata,title,is_active")
        .eq("lesson_plan_id", planId)
        .eq("curriculum_week_number", week)
        .eq("is_active", false),
      (db as any)
        .from("flashcard_decks")
        .select("id,title,lesson_id,is_public")
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
  }>;
  const deckSelectError = decksRes?.error as { message: string } | null;

  const probeRows: SessionRow[] = [
    ...(draftLessons ?? []).map((row: any) => ({
      metadata: row.metadata as Record<string, unknown> | null,
      title: row.title,
    })),
    ...(heldAssignments ?? []).map((row: any) => ({
      metadata: row.metadata as Record<string, unknown> | null,
      title: row.title,
    })),
    ...heldDecks.map((row) => ({ title: row.title })),
  ];

  const session = resolveEffectiveReleaseSession(probeRows, input.session);

  const lessonIds = (draftLessons ?? [])
    .filter((row: any) =>
      matchesReleaseSession(
        {
          metadata: row.metadata as Record<string, unknown> | null,
          title: row.title,
        },
        session,
      ),
    )
    .map((row: any) => String(row.id));

  let lessonsReleased = 0;
  if (lessonIds.length) {
    const { data: released, error: lessonError } = await db
      .from("lessons")
      .update({ status: "active", updated_at: now })
      .in("id", lessonIds)
      .eq("status", "draft")
      .select("id");
    if (lessonError) return empty(session, lessonError.message);
    lessonsReleased = released?.length ?? 0;
  }

  const assignmentIds = (heldAssignments ?? [])
    .filter((row: any) =>
      matchesReleaseSession(
        {
          metadata: row.metadata as Record<string, unknown> | null,
          title: row.title,
        },
        session,
      ),
    )
    .map((row: any) => String(row.id));

  let assignmentsReleased = 0;
  let assignmentError: { message: string } | null = null;
  if (assignmentIds.length) {
    const { data: activated, error } = await db
      .from("assignments")
      .update({ is_active: true, updated_at: now })
      .in("id", assignmentIds)
      .eq("is_active", false)
      .select("id");
    if (error) assignmentError = error;
    else {
      assignmentsReleased = activated?.length ?? 0;
      if (Array.isArray(activated) && activated.length > 0) {
        const { triggerAssignmentReleaseNotifications } = await import(
          "@/lib/assignments/notifications"
        );
        void Promise.all(
          activated.map((row: { id: string }) =>
            triggerAssignmentReleaseNotifications(row.id).catch(console.error),
          ),
        );
      }
    }
  }

  if (deckSelectError && !assignmentError) {
    return {
      planId,
      week,
      session,
      lessons_released: lessonsReleased,
      assignments_released: assignmentsReleased,
      flashcards_released: 0,
      error: deckSelectError.message,
    };
  }

  // Prefer session match. Only follow a released lesson when the deck itself
  // is unscoped or already matches the meeting — otherwise Class 2 decks that
  // share a lesson_id would go live with Class 1.
  const releasedLessonSet = new Set(lessonIds);
  const deckIds = heldDecks
    .filter((row) => {
      if (matchesReleaseSession({ title: row.title }, session)) return true;
      if (
        row.lesson_id &&
        releasedLessonSet.has(String(row.lesson_id)) &&
        assetMeetingSession({ title: row.title }) < 1
      ) {
        return true;
      }
      return false;
    })
    .map((row) => String(row.id));

  let flashcardsReleased = 0;
  let deckError: { message: string } | null = deckSelectError;
  if (deckIds.length && !deckSelectError) {
    const { data: decks, error } = await (db as any)
      .from("flashcard_decks")
      .update({ is_public: true, updated_at: now })
      .in("id", deckIds)
      .eq("is_public", false)
      .select("id");
    if (error) deckError = error;
    else flashcardsReleased = decks?.length ?? 0;
  }

  if (assignmentError && !deckError) {
    return {
      planId,
      week,
      session,
      lessons_released: lessonsReleased,
      assignments_released: 0,
      flashcards_released: flashcardsReleased,
      error: assignmentError.message,
    };
  }

  return {
    planId,
    week,
    session,
    lessons_released: lessonsReleased,
    assignments_released: assignmentError ? 0 : assignmentsReleased,
    flashcards_released: deckError ? 0 : flashcardsReleased,
    ...(assignmentError || deckError
      ? {
          error:
            assignmentError?.message ||
            deckError?.message ||
            "Partial release",
        }
      : {}),
  };
}
