import {
  buildTeachingWeekRows,
  type TeachingWorkspaceRowsInput,
} from "./teaching-workspace";
import { WEEK_PACKAGE_ASSETS, type WeekPackageAsset } from "./week-package";

export const TEACHING_PACKAGE_REVIEW_THRESHOLD = 80;

export type PlanAssetSummary = {
  expected: number;
  prepared: number;
  held: number;
  live: number;
};

export type PlanContentSummary = {
  slots: number;
  expected_assets: number;
  prepared_assets: number;
  held_assets: number;
  live_assets: number;
  prepared_pct: number;
  released_pct: number;
  complete_slots: number;
  released_slots: number;
  review_ready: boolean;
  state: "empty" | "in_progress" | "ready_to_review" | "mixed" | "released";
  by_asset: Record<WeekPackageAsset, PlanAssetSummary>;
};

function blankAssetSummary(): Record<WeekPackageAsset, PlanAssetSummary> {
  return WEEK_PACKAGE_ASSETS.reduce(
    (summary, asset) => {
      summary[asset] = { expected: 0, prepared: 0, held: 0, live: 0 };
      return summary;
    },
    {} as Record<WeekPackageAsset, PlanAssetSummary>
  );
}

/**
 * One plan-level roll-up of the same five-asset contract used by the class
 * workspace and release gate. A plan list must never invent a second meaning
 * for "ready" by counting only lessons or homework.
 */
export function summarisePlanContent(
  input: TeachingWorkspaceRowsInput
): PlanContentSummary {
  const rows = buildTeachingWeekRows(input);
  const byAsset = blankAssetSummary();

  let preparedAssets = 0;
  let heldAssets = 0;
  let liveAssets = 0;
  let completeSlots = 0;
  let releasedSlots = 0;

  for (const row of rows) {
    if (row.packageStatus.complete) completeSlots += 1;
    if (row.visibilitySummary.fullyLive) releasedSlots += 1;

    for (const asset of WEEK_PACKAGE_ASSETS) {
      const visibility = row.visibility[asset];
      byAsset[asset].expected += 1;
      if (visibility === "missing") continue;

      preparedAssets += 1;
      byAsset[asset].prepared += 1;
      if (visibility === "held") {
        heldAssets += 1;
        byAsset[asset].held += 1;
      } else {
        liveAssets += 1;
        byAsset[asset].live += 1;
      }
    }
  }

  const expectedAssets = rows.length * WEEK_PACKAGE_ASSETS.length;
  const preparedPct = expectedAssets
    ? Math.round((preparedAssets / expectedAssets) * 100)
    : 0;
  const releasedPct = expectedAssets
    ? Math.round((liveAssets / expectedAssets) * 100)
    : 0;
  const reviewReady =
    preparedPct >= TEACHING_PACKAGE_REVIEW_THRESHOLD && heldAssets > 0;

  const state: PlanContentSummary["state"] =
    preparedAssets === 0
      ? "empty"
      : expectedAssets > 0 && liveAssets === expectedAssets
        ? "released"
        : reviewReady
          ? "ready_to_review"
          : liveAssets > 0 && (heldAssets > 0 || preparedAssets < expectedAssets)
            ? "mixed"
            : "in_progress";

  return {
    slots: rows.length,
    expected_assets: expectedAssets,
    prepared_assets: preparedAssets,
    held_assets: heldAssets,
    live_assets: liveAssets,
    prepared_pct: preparedPct,
    released_pct: releasedPct,
    complete_slots: completeSlots,
    released_slots: releasedSlots,
    review_ready: reviewReady,
    state,
    by_asset: byAsset,
  };
}
