import { planMeetingLookupKey } from "./session-identity";

export type DeliveryRow = {
  week_number: number;
  session_number?: number | null;
  status: string;
};
export type WeekTrackingRow = { status: string };

export type ClassCoverage = {
  /** Weeks actually taught. */
  delivered: number;
  /** Weeks the class is expected to teach. */
  planned: number;
};

/**
 * How much of a class's curriculum has been taught, from the two places that
 * record it.
 *
 * The Teaching workspace writes `class_lesson_delivery`; older flows wrote
 * `curriculum_week_tracking`. Delivery rows win whenever any exist, so the bar
 * matches what teachers mark in the Teaching tab — reading the legacy table
 * first left the bar empty forever for classes on the current flow.
 *
 * A teaching slot can hold several delivery rows, so they collapse by
 * week+session before counting, and "delivered" beats any other status for
 * that slot. This keeps school weeks deduplicated while preserving distinct
 * meetings in multi-session programmes.
 *
 * This lived twice, copied between the initial page load and the realtime
 * refresh, which meant the precedence rule had two copies that could drift.
 */
export function classCoverageFromRows(
  deliveryRows: readonly DeliveryRow[] | null | undefined,
  weekRows: readonly WeekTrackingRow[] | null | undefined
): ClassCoverage {
  const delivery = deliveryRows ?? [];
  const tracking = weekRows ?? [];

  if (delivery.length > 0) {
    const statusBySlot = new Map<string, string>();
    for (const row of delivery) {
      const week = Number(row.week_number);
      if (!Number.isFinite(week)) continue;
      const key = planMeetingLookupKey(week, row.session_number);
      const seen = statusBySlot.get(key);
      if (row.status === "delivered" || !seen) statusBySlot.set(key, row.status);
    }
    const statuses = [...statusBySlot.values()];
    return {
      delivered: statuses.filter((status) => status === "delivered").length,
      planned: statuses.length,
    };
  }

  return {
    delivered: tracking.filter((row) =>
      row.status === "delivered" || row.status === "completed"
    ).length,
    planned: tracking.length,
  };
}
