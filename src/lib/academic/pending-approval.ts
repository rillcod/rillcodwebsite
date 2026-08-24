/**
 * Shared types for the teacher Approvals inbox.
 * One shape for API + dashboard so keys and session fields cannot drift.
 */

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
