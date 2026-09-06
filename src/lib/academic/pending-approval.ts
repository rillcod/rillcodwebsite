/**
 * Shared types for the teacher Approvals inbox.
 * One shape for API + dashboard so keys and session fields cannot drift.
 */

import { canonicalMeetingSession } from '@/lib/academic/session-identity';

export type PendingApprovalItem = {
  kind: 'lesson' | 'slides' | 'assignment' | 'project' | 'flashcards';
  id: string;
  title: string;
  state: 'held' | 'live';
};

export type PendingWeek = {
  planId: string;
  classId?: string | null;
  className: string | null;
  courseTitle: string | null;
  week: number;
  /** Class meeting within the week (1-based). School weeks are Class 1. */
  session: number;
  /** How many class meetings this calendar week has (1 or 2). */
  meetingsInWeek: number;
  enrollmentType?: string | null;
  isSpecial?: boolean;
  topic: string;
  objectives?: string | string[] | null;
  activities?: string | string[] | null;
  classwork?: string | null;
  assignmentBrief?: string | null;
  items: PendingApprovalItem[];
  /** A week may be reviewed before every configured item exists. */
  missingKinds: PendingApprovalItem['kind'][];
  complete: boolean;
  /** True when the class plan may share a complete future package automatically. */
  autoPublish: boolean;
};

export type PendingApprovalSummary = {
  total: number;
  ready: number;
  needsRepair: number;
  plans: number;
  autoDeliveryPlans: number;
  reviewFirstPlans: number;
};

export function pendingWeekKey(row: {
  planId: string;
  week: number;
  session?: number | null;
}): string {
  const session = Number(row.session);
  const meeting =
    Number.isFinite(session) && session > 0 ? Math.floor(session) : 1;
  return `${row.planId}:${row.week}:s${meeting}`;
}

/** Enabling unattended learner delivery is an Academic Office decision. */
export function canSetAutomaticDelivery(
  role: string | null | undefined,
  autoPublish: boolean,
): boolean {
  if (role === "admin") return true;
  return role === "teacher" && autoPublish === false;
}

/** Compact queue truth used by the Academic overview and delivery workspace. */
export function summarizePendingApprovals(
  rows: readonly PendingWeek[],
): PendingApprovalSummary {
  const planModes = new Map<string, boolean>();
  for (const row of rows) {
    planModes.set(row.planId, row.autoPublish === true);
  }
  const autoDeliveryPlans = [...planModes.values()].filter(Boolean).length;
  const ready = rows.filter((row) => row.complete).length;
  return {
    total: rows.length,
    ready,
    needsRepair: rows.length - ready,
    plans: planModes.size,
    autoDeliveryPlans,
    reviewFirstPlans: planModes.size - autoDeliveryPlans,
  };
}

/** Where the "week is ready" notice should open — the same meeting the sweep prepared. */
export function weekReadyReviewPath(input: {
  planId: string;
  week: number;
  session?: number | null;
  autoPublish?: boolean;
}): string {
  const session = canonicalMeetingSession(input.session);
  if (input.autoPublish === true) {
    return `/dashboard/lesson-plans/${input.planId}?week=${input.week}&session=${session}`;
  }
  return `/dashboard/teaching/approvals?week=${input.week}&session=${session}&plan=${input.planId}`;
}
