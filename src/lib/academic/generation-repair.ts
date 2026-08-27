import {
  assetMatchesMeeting,
  keepPreparedMeetingContent,
  type WeekPackageAsset,
} from "@/lib/academic/week-package";
import {
  normaliseTypes,
  type WeekContentType,
} from "@/lib/academic/auto-generate-settings";

type Row = Record<string, any>;

export type GenerationInventory = {
  lessons?: Row[] | null;
  slides?: Row[] | null;
  flashcards?: Row[] | null;
  assignments?: Row[] | null;
};

export type GenerationRepairDecision = {
  requestedTypes: WeekContentType[];
  typesToRun: WeekContentType[];
  missingAssets: WeekPackageAsset[];
  staleAssets: Array<Extract<WeekPackageAsset, "slides" | "flashcards">>;
};

const TYPE_FOR_ASSET: Record<WeekPackageAsset, WeekContentType> = {
  lesson: "lessons",
  slides: "slides",
  flashcards: "flashcards",
  assignment: "assignments",
  project: "projects",
};

/**
 * Decide what actually needs a generator call for one class meeting.
 * Existing teacher work is presence, not an invitation to regenerate it.
 * Only missing content and non-customized stale derived content are repaired.
 */
export function decideGenerationRepairTypes(input: {
  requestedTypes?: unknown;
  week: number;
  session: number;
  inventory: GenerationInventory;
}): GenerationRepairDecision {
  const requestedTypes = normaliseTypes(input.requestedTypes);
  const lessons = (input.inventory.lessons ?? []).filter((row) =>
    assetMatchesMeeting(row, input.week, input.session)
  );
  const slides = (input.inventory.slides ?? []).filter((row) =>
    assetMatchesMeeting(row, input.week, input.session)
  );
  const flashcards = (input.inventory.flashcards ?? []).filter((row) =>
    assetMatchesMeeting(row, input.week, input.session)
  );
  const assignments = (input.inventory.assignments ?? []).filter((row) =>
    assetMatchesMeeting(row, input.week, input.session)
  );
  const homework = assignments.filter(
    (row) => String(row.assignment_type ?? "").toLowerCase() !== "project"
  );
  const projects = assignments.filter(
    (row) => String(row.assignment_type ?? "").toLowerCase() === "project"
  );

  const rows: Record<WeekPackageAsset, Row[]> = {
    lesson: lessons,
    slides,
    flashcards,
    assignment: homework,
    project: projects,
  };
  const missingAssets = (Object.keys(rows) as WeekPackageAsset[]).filter(
    (asset) => rows[asset].length === 0
  );
  const staleAssets = (["slides", "flashcards"] as const).filter(
    (asset) =>
      rows[asset].length > 0 &&
      !keepPreparedMeetingContent(rows[asset], input.week, input.session),
  );
  const needed = new Set<WeekContentType>([
    ...missingAssets.map((asset) => TYPE_FOR_ASSET[asset]),
    ...staleAssets.map((asset) => TYPE_FOR_ASSET[asset]),
  ]);
  const requested = new Set(requestedTypes);
  let typesToRun = requestedTypes.filter((type) => needed.has(type));

  // Slides and practice cards depend on a lesson. A narrow repair request must
  // include that dependency when the lesson itself is missing.
  if (
    missingAssets.includes("lesson") &&
    typesToRun.some((type) => type === "slides" || type === "flashcards") &&
    !typesToRun.includes("lessons")
  ) {
    typesToRun = ["lessons", ...typesToRun];
  }

  // Preserve the configured order even after adding a dependency.
  typesToRun = normaliseTypes(typesToRun).filter(
    (type) => typesToRun.includes(type) || (type !== "slides" && type !== "flashcards")
  );
  // normaliseTypes([]) means "all" for settings compatibility; a repair with
  // nothing missing must remain empty.
  if (needed.size === 0 || ![...requested].some((type) => needed.has(type))) {
    typesToRun = [];
  }

  return { requestedTypes, typesToRun, missingAssets, staleAssets };
}

export async function resolveGenerationRepairTypes(input: {
  db: any;
  planId: string;
  week: number;
  session: number;
  requestedTypes?: unknown;
}): Promise<GenerationRepairDecision | null> {
  try {
    const [lessons, slides, flashcards, assignments] = await Promise.all([
      input.db
        .from("lessons")
        .select(
          "id,lesson_plan_id,curriculum_week_number,session_number,metadata"
        )
        .or(
          `lesson_plan_id.eq.${input.planId},metadata->>lesson_plan_id.eq.${input.planId}`
        ),
      input.db
        .from("lesson_materials")
        .select(
          "id,lesson_plan_id,curriculum_week_number,session_number,content_stale_at,metadata"
        )
        .eq("file_type", "slide-deck")
        .or(
          `lesson_plan_id.eq.${input.planId},metadata->>lesson_plan_id.eq.${input.planId}`
        ),
      input.db
        .from("flashcard_decks")
        .select(
          "id,lesson_plan_id,curriculum_week_number,session_number,content_stale_at,metadata"
        )
        .or(
          `lesson_plan_id.eq.${input.planId},metadata->>lesson_plan_id.eq.${input.planId}`
        ),
      input.db
        .from("assignments")
        .select(
          "id,lesson_plan_id,assignment_type,curriculum_week_number,session_number,metadata"
        )
        .or(
          `lesson_plan_id.eq.${input.planId},metadata->>lesson_plan_id.eq.${input.planId}`
        ),
    ]);
    const error = lessons.error ?? slides.error ?? flashcards.error ?? assignments.error;
    if (error) {
      console.warn("[teaching-generation] repair inventory unavailable", {
        code: error.code ?? null,
        planId: input.planId,
      });
      return null;
    }
    return decideGenerationRepairTypes({
      requestedTypes: input.requestedTypes,
      week: input.week,
      session: input.session,
      inventory: {
        lessons: lessons.data,
        slides: slides.data,
        flashcards: flashcards.data,
        assignments: assignments.data,
      },
    });
  } catch (error) {
    console.warn("[teaching-generation] repair inventory failed", error);
    return null;
  }
}
