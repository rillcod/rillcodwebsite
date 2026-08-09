export type RosterPlacement = { student_id: string | null; class_id: string | null; status: string | null };

export function isActiveRosterStatus(status: string | null): boolean {
  return !status || !['withdrawn', 'ended', 'removed'].includes(status.toLowerCase());
}

/** Resolve one authoritative class per learner; conflicting active rows are never guessed. */
export function resolveActiveRosterPlacements(rows: RosterPlacement[]) {
  const placements = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const row of rows) {
    if (!row.student_id || !row.class_id || !isActiveRosterStatus(row.status)) continue;
    const existing = placements.get(row.student_id);
    if (existing && existing !== row.class_id) conflicts.add(row.student_id);
    else placements.set(row.student_id, row.class_id);
  }
  for (const studentId of conflicts) placements.delete(studentId);
  return { placements, conflicts };
}
