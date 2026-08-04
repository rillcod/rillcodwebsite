import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One release path for a prepared week.
 *
 * Both the approvals inbox and the plan-page "Release week" button used to
 * invent their own filters — one keyed on curriculum_week_number, the other on
 * legacy metadata — so the same week could release in one place and no-op in
 * the other. Everything that publishes a held week goes through here.
 */
export type WeekReleaseResult = {
  planId: string;
  week: number;
  lessons_released: number;
  assignments_released: number;
  flashcards_released: number;
  error?: string;
};

export async function releasePreparedWeek(input: {
  planId: string;
  week: number;
  now?: string;
}): Promise<WeekReleaseResult> {
  const db = createAdminClient();
  const now = input.now ?? new Date().toISOString();
  const { planId, week } = input;

  const { data: released, error: lessonError } = await db
    .from("lessons")
    .update({ status: "active", updated_at: now })
    .eq("lesson_plan_id", planId)
    .eq("curriculum_week_number", week)
    .eq("status", "draft")
    .select("id");

  if (lessonError) {
    return {
      planId,
      week,
      lessons_released: 0,
      assignments_released: 0,
      flashcards_released: 0,
      error: lessonError.message,
    };
  }

  const { data: activated, error: assignmentError } = await db
    .from("assignments")
    .update({ is_active: true, updated_at: now })
    .eq("lesson_plan_id", planId)
    .eq("curriculum_week_number", week)
    .eq("is_active", false)
    .select("id");

  // Held flashcard decks use is_public === false. Null/true stay as they were.
  const { data: decks, error: deckError } = await (db as any)
    .from("flashcard_decks")
    .update({ is_public: true, updated_at: now })
    .eq("lesson_plan_id", planId)
    .eq("curriculum_week_number", week)
    .eq("is_public", false)
    .select("id");

  if (assignmentError && !deckError) {
    return {
      planId,
      week,
      lessons_released: released?.length ?? 0,
      assignments_released: 0,
      flashcards_released: decks?.length ?? 0,
      error: assignmentError.message,
    };
  }

  if (Array.isArray(activated) && activated.length > 0) {
    const { triggerAssignmentReleaseNotifications } = await import(
      "@/lib/assignments/notifications"
    );
    void Promise.all(
      activated.map((row: { id: string }) =>
        triggerAssignmentReleaseNotifications(row.id).catch(console.error)
      )
    );
  }

  return {
    planId,
    week,
    lessons_released: released?.length ?? 0,
    assignments_released: assignmentError ? 0 : activated?.length ?? 0,
    flashcards_released: deckError ? 0 : decks?.length ?? 0,
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
