/**
 * Term-calendar due dates for generated homework and projects.
 *
 * Manual "new assignment" forms use predictive-entry (from today + type defaults).
 * Generators must use this helper so homework/project deadlines stay aligned with
 * the plan week — and with each other — instead of drifting in route comments.
 */
export function dueDateForPlanWeek(
  termStart: string | Date,
  week: number,
  options?: { extraDays?: number; cadenceDays?: number },
): Date {
  const cadence = Math.max(1, Number(options?.cadenceDays) || 7);
  const extra = Math.max(0, Number(options?.extraDays) || 0);
  const safeWeek = Math.max(1, Math.floor(Number(week) || 1));
  const due = new Date(termStart);
  due.setDate(due.getDate() + safeWeek * cadence + extra);
  due.setHours(18, 0, 0, 0);
  return due;
}
