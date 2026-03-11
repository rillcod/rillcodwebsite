/**
 * Shared helper: fetch assignment_submissions with portal_users data.
 * Uses the explicit FK column hint to resolve the ambiguous relationship.
 * Works around the "multiple relationships" error for assignment_submissions ↔ portal_users.
 */
export const SUBMISSIONS_WITH_USER_SELECT = `
  id, grade, feedback, status, submitted_at, graded_at,
  submission_text, file_url, portal_user_id,
  assignments (
    id, title, max_points, due_date, created_by,
    courses ( title, teacher_id, programs ( name ) )
  ),
  portal_users!assignment_submissions_portal_user_id_fkey ( id, full_name, email, school_id, school_name )
`;

export const SUBMISSIONS_ACTIVITY_SELECT = `
  id, status, submitted_at,
  portal_users!assignment_submissions_portal_user_id_fkey ( full_name, school_id, school_name ),
  assignments ( title, max_points )
`;
