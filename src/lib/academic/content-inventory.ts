/**
 * Where the five week-package assets actually live, and how to audit them.
 *
 * `week-package.ts` owns the contract — which five assets make a week, and when
 * each counts as live. This module is the other half: which table each asset is
 * stored in, how it links back to its plan, and how a class's whole content
 * position rolls up. Both the System Health sweep and the accountability engine
 * read from here so the two can never disagree about what "complete" means.
 *
 * Written because the sweep only ever looked at lessons and assignments. Slides
 * and flashcard decks have no `metadata` column at all, so the sweep's
 * The lesson_plan_id foreign key is now the only identity. Metadata may hold
 * authoring details, but it must never decide which class receives content.
 */
import {
  WEEK_PACKAGE_ASSETS,
  academicWeekNumber,
  assignmentVisibility,
  flashcardVisibility,
  lessonVisibility,
  slidesVisibility,
  type AssetVisibility,
  type WeekPackageAsset,
} from "./week-package";

/** The table each asset is stored in. Assignments and projects share one table. */
export const ASSET_TABLE: Record<WeekPackageAsset, string> = {
  lesson: "lessons",
  slides: "lesson_materials",
  flashcards: "flashcard_decks",
  assignment: "assignments",
  project: "assignments",
};

/** Every distinct table that holds week-package content. */
export const ASSET_TABLES: readonly string[] = [
  ...new Set(WEEK_PACKAGE_ASSETS.map((asset) => ASSET_TABLE[asset])),
];

/** `assignments.assignment_type` value that makes a row a project, not homework. */
export const PROJECT_ASSIGNMENT_TYPE = "project";

export type PlanLinkedRow = {
  id?: string;
  lesson_plan_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** The canonical plan link. Metadata is deliberately not an identity fallback. */
export function planIdOf(row: PlanLinkedRow | null | undefined): string | null {
  if (!row) return null;
  const column = typeof row.lesson_plan_id === "string" ? row.lesson_plan_id.trim() : "";
  return column || null;
}

/**
 * A row is orphaned when it names a plan that no longer exists.
 *
 * A row with no plan link at all is NOT orphaned — plenty of content is created
 * outside the plan flow, and treating "unlinked" as "orphaned" would offer real
 * teaching material up for deletion.
 */
export function isOrphanedFromPlan(
  row: PlanLinkedRow | null | undefined,
  planIds: ReadonlySet<string>,
): boolean {
  const planId = planIdOf(row);
  return planId !== null && !planIds.has(planId);
}

export function findOrphanedAssets<T extends PlanLinkedRow>(
  rows: readonly T[] | null | undefined,
  planIds: ReadonlySet<string>,
): T[] {
  return (rows ?? []).filter((row) => isOrphanedFromPlan(row, planIds));
}

export type LessonChildRow = PlanLinkedRow & { lesson_id?: string | null };

/**
 * Slides and flashcard decks are generated as part of a lesson and stay bound to
 * it by `lesson_id`. They are therefore only debris when their lesson is gone
 * too.
 *
 * Judging them on the plan link alone would strip a healthy lesson of its slide
 * deck the moment its plan was tidied away — the deck is that lesson's slides,
 * however stale its own plan link looks. `surviving` must be the lessons that
 * remain AFTER the purge, not the lessons present before it, or a deck whose
 * lesson is deleted in the same run is left behind as fresh debris.
 */
export function findOrphanedLessonChildren<T extends LessonChildRow>(
  rows: readonly T[] | null | undefined,
  planIds: ReadonlySet<string>,
  surviving: ReadonlySet<string>,
): T[] {
  return (rows ?? []).filter((row) => {
    const lessonId = typeof row.lesson_id === 'string' ? row.lesson_id.trim() : '';
    if (lessonId && surviving.has(lessonId)) return false;
    return isOrphanedFromPlan(row, planIds);
  });
}

export type AssignmentRow = {
  id?: string;
  assignment_type?: string | null;
  is_active?: boolean | null;
  curriculum_week_number?: unknown;
  metadata?: Record<string, unknown> | null;
};

/** Which of the two assignment-backed assets a row represents. */
export function assignmentAssetKind(
  row: Pick<AssignmentRow, "assignment_type">,
): Extract<WeekPackageAsset, "assignment" | "project"> {
  return String(row.assignment_type ?? "").trim().toLowerCase() === PROJECT_ASSIGNMENT_TYPE
    ? "project"
    : "assignment";
}

export type ContentAuditInput = {
  lessons?: readonly { status?: string | null; curriculum_week_number?: unknown; metadata?: Record<string, unknown> | null }[] | null;
  slides?: readonly { curriculum_week_number?: unknown; metadata?: Record<string, unknown> | null }[] | null;
  flashcards?: readonly { is_public?: boolean | null; curriculum_week_number?: unknown; metadata?: Record<string, unknown> | null }[] | null;
  assignments?: readonly AssignmentRow[] | null;
};

export type AssetTally = { present: number; live: number; held: number };

export type ContentAudit = {
  /** Per asset: how many exist, how many students can actually see. */
  byAsset: Record<WeekPackageAsset, AssetTally>;
  /** Assets with nothing produced at all. */
  missing: WeekPackageAsset[];
  /** Assets that exist but are all still held back from students. */
  heldBack: WeekPackageAsset[];
  /** Distinct teaching weeks any content was produced for. */
  weeksTouched: number;
  /** How many of the five assets exist in any form. */
  preparedCount: number;
  /** How many of the five have at least one item visible to students. */
  releasedCount: number;
  preparedPct: number;
  releasedPct: number;
  /** Nothing at all has been produced. */
  empty: boolean;
  /** Work exists, but not one item of it reaches students. */
  preparedButInvisible: boolean;
};

function emptyTally(): Record<WeekPackageAsset, AssetTally> {
  return WEEK_PACKAGE_ASSETS.reduce((acc, asset) => {
    acc[asset] = { present: 0, live: 0, held: 0 };
    return acc;
  }, {} as Record<WeekPackageAsset, AssetTally>);
}

function record(
  tally: Record<WeekPackageAsset, AssetTally>,
  asset: WeekPackageAsset,
  visibility: AssetVisibility,
) {
  if (visibility === "missing") return;
  tally[asset].present += 1;
  if (visibility === "live") tally[asset].live += 1;
  else tally[asset].held += 1;
}

/**
 * Roll a class's content up across every week it holds.
 *
 * Deliberately counts items rather than judging week-by-week completeness:
 * this answers "has this class produced each kind of material, and can students
 * see it", which is the question the sweep and the accountability engine both
 * ask. Per-week readiness stays with `weekPackageStatus`.
 */
export function auditContent(input: ContentAuditInput): ContentAudit {
  const byAsset = emptyTally();
  const weeks = new Set<number>();

  const noteWeek = (row: { curriculum_week_number?: unknown; metadata?: Record<string, unknown> | null }) => {
    const week = academicWeekNumber(row);
    if (week !== null) weeks.add(week);
  };

  for (const lesson of input.lessons ?? []) {
    record(byAsset, "lesson", lessonVisibility(lesson));
    noteWeek(lesson);
  }

  // Slides follow their own lesson's status. Rolled up across a class there is
  // no single lesson to follow, so a slide deck counts as live only when the
  // class has at least one live lesson to carry it.
  const hasLiveLesson = (input.lessons ?? []).some((l) => lessonVisibility(l) === "live");
  const carrierLesson = hasLiveLesson ? { status: "active" } : { status: "draft" };
  for (const deck of input.slides ?? []) {
    record(byAsset, "slides", slidesVisibility(deck, carrierLesson));
    noteWeek(deck);
  }

  for (const deck of input.flashcards ?? []) {
    record(byAsset, "flashcards", flashcardVisibility(deck));
    noteWeek(deck);
  }

  for (const row of input.assignments ?? []) {
    record(byAsset, assignmentAssetKind(row), assignmentVisibility(row));
    noteWeek(row);
  }

  const missing = WEEK_PACKAGE_ASSETS.filter((a) => byAsset[a].present === 0);
  const heldBack = WEEK_PACKAGE_ASSETS.filter((a) => byAsset[a].present > 0 && byAsset[a].live === 0);
  const preparedCount = WEEK_PACKAGE_ASSETS.length - missing.length;
  const releasedCount = WEEK_PACKAGE_ASSETS.filter((a) => byAsset[a].live > 0).length;
  const total = WEEK_PACKAGE_ASSETS.length;

  return {
    byAsset,
    missing,
    heldBack,
    weeksTouched: weeks.size,
    preparedCount,
    releasedCount,
    preparedPct: Math.round((preparedCount / total) * 100),
    releasedPct: Math.round((releasedCount / total) * 100),
    empty: preparedCount === 0,
    preparedButInvisible: preparedCount > 0 && releasedCount === 0,
  };
}

/** One-line plain-English verdict for a class's content position. */
export function contentVerdict(audit: ContentAudit): string {
  if (audit.empty) return "No teaching content prepared";
  if (audit.preparedButInvisible) {
    return `Prepared ${audit.preparedCount}/5, but nothing released to students`;
  }
  if (audit.missing.length === 0 && audit.heldBack.length === 0) {
    return "All five prepared and released";
  }
  const parts: string[] = [`Prepared ${audit.preparedCount}/5`];
  if (audit.missing.length) parts.push(`missing ${audit.missing.join(", ")}`);
  if (audit.heldBack.length) parts.push(`held ${audit.heldBack.join(", ")}`);
  return parts.join(" · ");
}
