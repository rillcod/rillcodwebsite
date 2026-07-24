/**
 * Canonical ID types in Rillcod — mixing these breaks parent links, progress, and credentials.
 *
 * | ID | Table.column | Used for |
 * |----|--------------|----------|
 * | studentRowId | students.id | parent_student_links.student_id, student_enrollments.student_id, attendance.student_id |
 * | portalUserId | portal_users.id | lesson_progress, assignments, enrollments.user_id, student_level_enrollments.student_id, auth |
 * | bridge | students.user_id → portal_users.id | Always resolve before portal-scoped queries |
 */

export type StudentRow = { id: string; user_id?: string | null; full_name?: string | null; name?: string | null };

export function studentDisplayName(row: Pick<StudentRow, 'full_name' | 'name'>): string {
  return (row.full_name || row.name || 'Your child').trim() || 'Your child';
}

/** Portal account required for progress/credential flows. */
export function requireStudentPortalUserId(
  row: Pick<StudentRow, 'user_id'>,
  context = 'Student',
): string {
  const id = row.user_id?.trim();
  if (!id) throw new Error(`${context} has no portal login yet (students.user_id is empty).`);
  return id;
}

/** Skip silently when onboarding has not created the portal user yet. */
export function optionalStudentPortalUserId(row: Pick<StudentRow, 'user_id'>): string | null {
  const id = row.user_id?.trim();
  return id || null;
}
