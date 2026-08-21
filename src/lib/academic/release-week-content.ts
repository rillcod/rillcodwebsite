import { createAdminClient } from "@/lib/supabase/admin";
import {
  assetMeetingSession,
  canonicalMeetingSession,
  normalizeMeetingSession,
  teachingMeetingLabel,
  type SessionBearing,
} from "@/lib/academic/session-identity";

/**
 * One release path for prepared teaching — Regular School and Special Programme.
 * Every release names a class meeting. School weeks are Class 1.
 */
export type WeekReleaseResult = {
  planId: string;
  week: number;
  session: number | null;
  lessons_released: number;
  assignments_released: number;
  slides_released: number;
  flashcards_released: number;
  error?: string;
  /** Multiple class meetings are held and the caller must name one. */
  needs_session?: boolean;
  /** Class meetings available to release when needs_session is true. */
  available_sessions?: number[];
};

type SessionRow = SessionBearing;

/**
 * Resolve which class meeting this release targets.
 *
 * Explicit session always wins. Otherwise:
 * - every held row is the same meeting → that meeting (school weeks are Class 1)
 * - two or more meetings → null (caller must pass session; never guess)
 */
export function resolveEffectiveReleaseSession(
  heldRows: SessionRow[],
  requested: number | null | undefined
): number | null {
  const explicit = normalizeMeetingSession(requested);
  if (explicit != null) return explicit;

  const sessions = new Set<number>();
  for (const row of heldRows) {
    sessions.add(assetMeetingSession(row));
  }
  if (sessions.size >= 2) return null;
  return [...sessions][0] ?? 1;
}

/** A held row belongs to this release only when its meeting matches. */
export function matchesReleaseSession(
  row: SessionRow,
  session: number | null | undefined
): boolean {
  const want = normalizeMeetingSession(session);
  if (want == null) return false;
  return assetMeetingSession(row) === want;
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
    slides_released: 0,
    flashcards_released: 0,
    ...(error ? { error } : {}),
  });

  const [{ data: draftLessons, error: lessonSelectError }, { data: heldAssignments, error: assignmentSelectError }, slidesRes, decksRes] =
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
        .from("lesson_materials")
        .select("id,title,lesson_id,is_public,session_number")
        .eq("lesson_plan_id", planId)
        .eq("curriculum_week_number", week)
        .eq("file_type", "slide-deck")
        .eq("is_public", false),
      (db as any)
        .from("flashcard_decks")
        .select("id,title,lesson_id,is_public,session_number")
        .eq("lesson_plan_id", planId)
        .eq("curriculum_week_number", week)
        .eq("is_public", false),
    ]);

  if (lessonSelectError) {
    return empty(normalizeMeetingSession(input.session), lessonSelectError.message);
  }
  if (assignmentSelectError) {
    return empty(normalizeMeetingSession(input.session), assignmentSelectError.message);
  }

  const heldDecks = (decksRes?.data ?? []) as Array<{
    id: string;
    title?: string | null;
    lesson_id?: string | null;
    session_number?: number | null;
  }>;
  const heldSlides = (slidesRes?.data ?? []) as Array<{
    id: string;
    title?: string | null;
    lesson_id?: string | null;
    session_number?: number | null;
  }>;
  const slideSelectError = slidesRes?.error as { message: string } | null;
  if (slideSelectError) {
    return empty(normalizeMeetingSession(input.session), slideSelectError.message);
  }
  const deckSelectError = decksRes?.error as { message: string } | null;
  if (deckSelectError) {
    return empty(normalizeMeetingSession(input.session), deckSelectError.message);
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
    ...heldSlides.map((row) => ({
      title: row.title,
      session_number: row.session_number,
    })),
    ...heldDecks.map((row) => ({
      title: row.title,
      session_number: row.session_number,
    })),
  ];

  const session = resolveEffectiveReleaseSession(probeRows, input.session);

  if (session == null) {
    const stamped = [
      ...new Set(probeRows.map((row) => assetMeetingSession(row))),
    ].sort((a, b) => a - b);
    return {
      ...empty(null),
      needs_session: true,
      available_sessions: stamped,
      error: `${teachingMeetingLabel(week)} has ${stamped.length} class meetings held for review. Choose which class meeting to release (Class ${stamped.join(", Class ")}).`,
    };
  }

  const { data: released, error: releaseError } = await (db as any).rpc(
    "release_prepared_week_atomic",
    {
      p_lesson_plan_id: planId,
      p_week_number: week,
      p_session_number: canonicalMeetingSession(session),
      p_released_at: now,
    }
  );
  if (releaseError) return empty(session, releaseError.message);

  const payload = (released ?? {}) as {
    lessons_released?: number;
    assignments_released?: number;
    slides_released?: number;
    flashcards_released?: number;
    assignment_ids?: string[];
  };
  const assignmentIds = Array.isArray(payload.assignment_ids)
    ? payload.assignment_ids.filter(Boolean)
    : [];

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
    slides_released: Number(payload.slides_released) || 0,
    flashcards_released: Number(payload.flashcards_released) || 0,
  };
}
