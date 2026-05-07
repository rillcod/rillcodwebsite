-- Prevent duplicate active student accounts for the same email.
-- A partial unique index covers only non-deleted student rows, so:
--   - Soft-deleted rows can share an email (they're ghost/purged accounts)
--   - Teachers, admins, parents are unaffected (role filter)
--   - The DB will REJECT any INSERT or UPDATE that would create a second
--     active student row with the same email, before the application even sees it.

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_student_email_unique
  ON public.portal_users (lower(email))
  WHERE role = 'student' AND is_deleted = false;
