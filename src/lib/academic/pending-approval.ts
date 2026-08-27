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
