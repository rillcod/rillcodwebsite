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
  metadata?: Record<string, unknown> | null;
};

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

export type WeekPackagePresence = Record<WeekPackageAsset, boolean>;

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
