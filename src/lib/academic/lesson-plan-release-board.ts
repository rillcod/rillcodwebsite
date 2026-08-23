import { buildTeachingWeekRows, type TeachingWorkspaceRowsInput } from "./teaching-workspace";
import { metadataMatchesWeek } from "@/lib/progression/lessonPlanOperation";

type Row = Record<string, any>;

export type LessonPlanReleaseBoardRow = {
  key: string;
  year_number: number;
  term_number: number;
  week_number: number;
  session_number: number;
  topic: string;
  release_status: "pending" | "draft" | "partial" | "released";
  prepared_count: number;
  total_count: 5;
  missing_assets: string[];
  held_assets: string[];
  lessons_total: number;
  lessons_published: number;
  assignments_total: number;
  assignments_active: number;
  projects_total: number;
  projects_active: number;
  slides_total: number;
  slides_public: number;
  flashcards_total: number;
  flashcards_public: number;
  latest_release_at: string | null;
  history: Array<{ type: string; at: string; status: string }>;
};

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function historyItem(type: string, row: Row | null, status: string) {
  const at = row?.updated_at ?? row?.created_at;
  if (!at) return null;
  return { type, at: String(at), status };
}

/**
 * The plan operations page is a second view of the class teaching workspace,
 * not a second readiness engine. Keep its five assets, meeting identity and
 * held/live meaning on the shared week-row contract.
 */
export function buildLessonPlanReleaseBoard(
  input: TeachingWorkspaceRowsInput,
): LessonPlanReleaseBoardRow[] {
  return (input.planWeeks ?? []).map((weekMeta) => {
    const syllabusRef = (weekMeta?.syllabus_ref ?? {}) as Row;
    const year = positiveNumber(syllabusRef.year_number, 1);
    const term = positiveNumber(syllabusRef.term_number, 1);
    const inSlot = (asset: Row) => {
      const metadata = (asset.metadata ?? {}) as Row;
      return metadataMatchesWeek({
        ...metadata,
        week_number:
          asset.curriculum_week_number ?? metadata.week_number ?? metadata.week,
        session_number:
          asset.session_number ?? metadata.session_number ?? metadata.session,
      }, weekMeta, year, term);
    };
    const [row] = buildTeachingWeekRows({
      ...input,
      planWeeks: [weekMeta],
      lessons: (input.lessons ?? []).filter(inSlot),
      assignments: (input.assignments ?? []).filter(inSlot),
      projects: (input.projects ?? []).filter(inSlot),
      slideDecks: (input.slideDecks ?? []).filter(inSlot),
      flashcardDecks: (input.flashcardDecks ?? []).filter(inSlot),
      exams: (input.exams ?? []).filter(inSlot),
      deliveries: (input.deliveries ?? []).filter(inSlot),
    });
    const preparedCount = row.packageStatus.readyCount;
    const liveCount = row.visibilitySummary.liveCount;
    const releaseStatus: LessonPlanReleaseBoardRow["release_status"] =
      preparedCount === 0
        ? "pending"
        : liveCount === 0
          ? "draft"
          : row.visibilitySummary.fullyLive
            ? "released"
            : "partial";

    const history = [
      historyItem("lesson", row.lesson, row.visibility.lesson),
      historyItem("assignment", row.assignment, row.visibility.assignment),
      historyItem("project", row.project, row.visibility.project),
      historyItem("slides", row.slideDeck, row.visibility.slides),
      historyItem("flashcards", row.flashcardDeck, row.visibility.flashcards),
    ]
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      key: `y${year}t${term}w${row.week}s${row.session}`,
      year_number: year,
      term_number: term,
      week_number: row.week,
      session_number: row.session,
      topic: row.topic,
      release_status: releaseStatus,
      prepared_count: preparedCount,
      total_count: 5,
      missing_assets: row.packageStatus.missing,
      held_assets: row.visibilitySummary.held,
      lessons_total: row.lesson ? 1 : 0,
      lessons_published: row.visibility.lesson === "live" ? 1 : 0,
      assignments_total: row.assignment ? 1 : 0,
      assignments_active: row.visibility.assignment === "live" ? 1 : 0,
      projects_total: row.project ? 1 : 0,
      projects_active: row.visibility.project === "live" ? 1 : 0,
      slides_total: row.slideDeck ? 1 : 0,
      slides_public: row.visibility.slides === "live" ? 1 : 0,
      flashcards_total: row.flashcardDeck ? 1 : 0,
      flashcards_public: row.visibility.flashcards === "live" ? 1 : 0,
      latest_release_at: history[0]?.at ?? null,
      history: history.slice(0, 5),
    };
  });
}
