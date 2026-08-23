/**
 * Week package readiness for teachers.
 *
 * Presence alone lied to teachers: a draft lesson and inactive homework still
 * counted as "Ready", so the class looked finished while students saw nothing.
 * Visibility (held vs live) is now first-class next to presence.
 */
import {
  assetMeetingSession,
  meetingLookupKey,
} from "@/lib/academic/session-identity";

export const WEEK_PACKAGE_ASSETS = [
  "lesson",
  "slides",
  "flashcards",
  "assignment",
  "project",
] as const;

export type WeekPackageAsset = (typeof WEEK_PACKAGE_ASSETS)[number];

export type WeekLinkedAsset = {
  curriculum_week_number?: unknown;
  session?: unknown;
  session_number?: unknown;
  metadata?: Record<string, unknown> | null;
  title?: string | null;
};

export type AssetVisibility = "missing" | "held" | "live";

/**
 * Read the canonical week column first, while still understanding records made
 * before the unified workflow copied the week out of metadata.
 */
export function academicWeekNumber(
  asset: WeekLinkedAsset | null | undefined
): number | null {
  if (!asset) return null;
  const candidates = [
    asset.curriculum_week_number,
    asset.metadata?.week,
    asset.metadata?.week_number,
  ];
  for (const candidate of candidates) {
    const week = Number(candidate);
    if (Number.isInteger(week) && week > 0) return week;
  }
  return null;
}

/** Keep the newest/first row supplied by the API for each teaching week. */
export function indexFirstByWeek<T extends WeekLinkedAsset>(
  rows: T[] | null | undefined
): Map<number, T> {
  const index = new Map<number, T>();
  for (const row of rows ?? []) {
    const week = academicWeekNumber(row);
    if (week !== null && !index.has(week)) index.set(week, row);
  }
  return index;
}

/**
 * Index by calendar week + session so multi-session plans do not collapse
 * onto the first lesson of the week.
 */
export function indexFirstByWeekSession<T extends WeekLinkedAsset>(
  rows: T[] | null | undefined
): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of rows ?? []) {
    const week = academicWeekNumber(row);
    if (week === null) continue;
    const session = assetMeetingSession(row);
    const key = meetingLookupKey(week, session);
    if (!index.has(key)) index.set(key, row);
  }
  return index;
}

export function weekSessionLookupKey(
  week: number,
  session?: number | null,
): string {
  return meetingLookupKey(week, session);
}

export type WeekPackagePresence = Record<WeekPackageAsset, boolean>;

export type WeekPackageVisibility = Record<WeekPackageAsset, AssetVisibility>;

export function weekPackageStatus(presence: WeekPackagePresence) {
  const ready = WEEK_PACKAGE_ASSETS.filter((asset) => presence[asset]);
  const missing = WEEK_PACKAGE_ASSETS.filter((asset) => !presence[asset]);
  return {
    ready,
    missing,
    readyCount: ready.length,
    totalCount: WEEK_PACKAGE_ASSETS.length,
    complete: missing.length === 0,
  };
}

export function weekPackagePrimaryAction(
  presence: WeekPackagePresence
): "prepare" | "review" {
  return weekPackageStatus(presence).complete ? "review" : "prepare";
}

/** Lesson is live when students may open it. */
export function lessonVisibility(lesson: {
  status?: string | null;
} | null | undefined): AssetVisibility {
  if (!lesson) return "missing";
  const status = String(lesson.status ?? "").toLowerCase();
  if (status === "active" || status === "published" || status === "scheduled") {
    return "live";
  }
  return "held";
}

/** Assignments/projects are live when is_active is true. */
export function assignmentVisibility(row: {
  is_active?: boolean | null;
} | null | undefined): AssetVisibility {
  if (!row) return "missing";
  return row.is_active === true ? "live" : "held";
}

/**
 * Flashcard decks hold for approval via is_public === false.
 * Null/true remains visible for decks created before the hold gate.
 */
export function flashcardVisibility(deck: {
  is_public?: boolean | null;
} | null | undefined): AssetVisibility {
  if (!deck) return "missing";
  return deck.is_public === false ? "held" : "live";
}

/**
 * Slides need both release gates: the deck itself must be public and its
 * lesson must be live. Older decks have no explicit flag, so null keeps the
 * legacy behaviour and follows the lesson.
 */
export function slidesVisibility(
  slideDeck: {
    id?: unknown;
    is_public?: boolean | null;
    curriculum_week_number?: unknown;
    metadata?: Record<string, unknown> | null;
  } | null | undefined,
  lesson: { status?: string | null } | null | undefined
): AssetVisibility {
  if (!slideDeck) return "missing";
  if (slideDeck.is_public === false) return "held";
  return lessonVisibility(lesson);
}

export function buildWeekVisibility(input: {
  lesson?: { status?: string | null } | null;
  slides?: {
    id?: unknown;
    is_public?: boolean | null;
    curriculum_week_number?: unknown;
    metadata?: Record<string, unknown> | null;
  } | null;
  flashcards?: { is_public?: boolean | null } | null;
  assignment?: { is_active?: boolean | null } | null;
  project?: { is_active?: boolean | null } | null;
}): WeekPackageVisibility {
  return {
    lesson: lessonVisibility(input.lesson),
    slides: slidesVisibility(input.slides, input.lesson),
    flashcards: flashcardVisibility(input.flashcards),
    assignment: assignmentVisibility(input.assignment),
    project: assignmentVisibility(input.project),
  };
}

export function weekVisibilitySummary(visibility: WeekPackageVisibility) {
  const held = WEEK_PACKAGE_ASSETS.filter((a) => visibility[a] === "held");
  const live = WEEK_PACKAGE_ASSETS.filter((a) => visibility[a] === "live");
  const missing = WEEK_PACKAGE_ASSETS.filter((a) => visibility[a] === "missing");
  return {
    held,
    live,
    missing,
    heldCount: held.length,
    liveCount: live.length,
    missingCount: missing.length,
    /** True when every present asset is live to students. */
    fullyLive: missing.length === 0 && held.length === 0 && live.length > 0,
    /** True when something exists but students cannot see it yet. */
    needsRelease: held.length > 0,
  };
}

/**
 * Next teacher action for a week, in classroom order.
 * prepare → release → teach (mark delivered is separate).
 */
export function weekClassroomAction(input: {
  presence: WeekPackagePresence;
  visibility: WeekPackageVisibility;
  taught?: boolean;
}): "publish_plan" | "prepare" | "release" | "teach" | "done" {
  const status = weekPackageStatus(input.presence);
  if (!status.complete) return "prepare";
  const vis = weekVisibilitySummary(input.visibility);
  if (vis.needsRelease) return "release";
  if (!input.taught) return "teach";
  return "done";
}
