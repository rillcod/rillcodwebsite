const ASSIGNMENT_DEFAULTS: Record<string, { days: number; maxPoints: number; multiStep: boolean }> = {
  homework: { days: 7, maxPoints: 20, multiStep: false },
  project: { days: 14, maxPoints: 100, multiStep: true },
  coding: { days: 7, maxPoints: 50, multiStep: true },
  quiz: { days: 3, maxPoints: 20, multiStep: false },
  exam: { days: 7, maxPoints: 100, multiStep: false },
  presentation: { days: 7, maxPoints: 50, multiStep: true },
  essay: { days: 7, maxPoints: 50, multiStep: false },
  research: { days: 14, maxPoints: 100, multiStep: true },
  lab: { days: 7, maxPoints: 50, multiStep: true },
  discussion: { days: 2, maxPoints: 10, multiStep: false },
};

/**
 * Defaults for the manual "new assignment" form (from today).
 * Generated week packages use `dueDateForPlanWeek` so deadlines follow the term calendar.
 */

export function formatDatetimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function buildAssignmentEntrySuggestion(type: string, now = new Date()) {
  const defaults = ASSIGNMENT_DEFAULTS[type] ?? ASSIGNMENT_DEFAULTS.homework;
  const due = new Date(now);
  due.setDate(due.getDate() + defaults.days);
  due.setHours(18, 0, 0, 0);
  if (due.getDay() === 6) due.setDate(due.getDate() + 2);
  if (due.getDay() === 0) due.setDate(due.getDate() + 1);

  return {
    dueDate: formatDatetimeLocal(due),
    maxPoints: defaults.maxPoints,
    multiStep: defaults.multiStep,
  };
}
