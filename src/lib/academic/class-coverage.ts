import { planMeetingLookupKey } from "./session-identity";

export type DeliveryRow = {
  week_number: number;
  session_number?: number | null;
  status: string;
};

export type ClassCoverage = {
  /** Meetings actually taught. */
  delivered: number;
  /** Meetings the class is expected to teach. */
  planned: number;
};

/**
 * How much of a class's curriculum has been taught.
 *
 * The Teaching workspace writes `class_lesson_delivery` with week + session.
 * Coverage uses that table only so the bar matches the same slots teachers
 * see and mark in the Teaching tab.
 *
 * A teaching slot can hold several delivery rows, so they collapse by
 * week+session before counting, and "delivered" beats any other status for
 * that slot.
 */
export function classCoverageFromRows(
  deliveryRows: readonly DeliveryRow[] | null | undefined
): ClassCoverage {
  const statusBySlot = new Map<string, string>();
  for (const row of deliveryRows ?? []) {
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
