import { indexFirstByWeekSession, weekSessionLookupKey } from "./week-package";

type AssetRow = {
  id?: unknown;
  title?: unknown;
  curriculum_week_number?: unknown;
  session?: unknown;
  session_number?: unknown;
  metadata?: Record<string, unknown> | null;
};

export type PreparedWeekPackage = {
  lessonId?: string;
  lessonTitle?: string;
  slideDeckId?: string;
  slideDeckTitle?: string;
  deckId?: string;
  deckTitle?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  projectId?: string;
  projectTitle?: string;
};

export type TeachingWorkspacePackageData = {
  plan?: { id?: unknown } | null;
  lessons?: AssetRow[] | null;
  slide_decks?: AssetRow[] | null;
  flashcard_decks?: AssetRow[] | null;
  assignments?: AssetRow[] | null;
  projects?: AssetRow[] | null;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Resolve the content saved for one exact class meeting from the canonical
 * teaching-workspace response. This deliberately uses plan + week + session;
 * week-only lookups can return Class 1 after the teacher prepared Class 2.
 */
export function preparedWeekPackageFromWorkspace(input: {
  data: TeachingWorkspacePackageData;
  planId: string;
  week: number;
  session?: number | null;
}): PreparedWeekPackage | null {
  if (String(input.data.plan?.id ?? "") !== input.planId) return null;

  const key = weekSessionLookupKey(input.week, input.session);
  const lesson = indexFirstByWeekSession(input.data.lessons).get(key);
  const slides = indexFirstByWeekSession(input.data.slide_decks).get(key);
  const cards = indexFirstByWeekSession(input.data.flashcard_decks).get(key);
  const assignment = indexFirstByWeekSession(input.data.assignments).get(key);
  const project = indexFirstByWeekSession(input.data.projects).get(key);

  const pkg: PreparedWeekPackage = {};
  const lessonId = stringValue(lesson?.id);
  if (lessonId) {
    pkg.lessonId = lessonId;
    pkg.lessonTitle = stringValue(lesson?.title);
  }
  const slideDeckId = stringValue(slides?.id);
  if (slideDeckId) {
    pkg.slideDeckId = slideDeckId;
    pkg.slideDeckTitle = stringValue(slides?.title);
  }
  const deckId = stringValue(cards?.id);
  if (deckId) {
    pkg.deckId = deckId;
    pkg.deckTitle = stringValue(cards?.title);
  }
  const assignmentId = stringValue(assignment?.id);
  if (assignmentId) {
    pkg.assignmentId = assignmentId;
    pkg.assignmentTitle = stringValue(assignment?.title);
  }
  const projectId = stringValue(project?.id);
  if (projectId) {
    pkg.projectId = projectId;
    pkg.projectTitle = stringValue(project?.title);
  }
  return pkg;
}
