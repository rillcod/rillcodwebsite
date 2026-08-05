/**
 * Shared types for the teacher Approvals inbox.
 * One shape for API + dashboard so keys and session fields cannot drift.
 */

export type PendingApprovalItem = {
  kind: 'lesson' | 'slides' | 'assignment' | 'project' | 'flashcards';
  id: string;
  title: string;
};

export type PendingWeek = {
  planId: string;
  className: string | null;
  courseTitle: string | null;
  week: number;
  /** Class meeting within the week (1-based); null for unscoped school weeks. */
  session: number | null;
  topic: string;
  items: PendingApprovalItem[];
};

export function pendingWeekKey(row: {
  planId: string;
  week: number;
  session?: number | null;
}): string {
  const s = Number(row.session);
  return Number.isFinite(s) && s > 0
    ? `${row.planId}:${row.week}:s${Math.floor(s)}`
    : `${row.planId}:${row.week}`;
}
