-- REAL backstop guard against duplicate student accounts for the SAME child.
--
-- A whitespace-fragile idempotency match (a stored trailing space made
-- `.ilike('full_name', trimmed)` miss) let a 15-min onboarding cron mint a fresh
-- student account for the same summer child on every run (Tedrick/Momodu/Soteria each
-- reached 9+ copies). The app match is now whitespace-robust, but this index is the
-- hard backstop: one students row per (school · normalised name · parent email), so a
-- re-onboard can never insert a second row for the same child.
--
-- Scoped to rows that HAVE a parent email (the summer/consent path always sets one), so
-- two genuinely different same-named children without a parent link are not constrained.

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_school_name_parent
  ON public.students (
    school_id,
    lower(btrim(coalesce(full_name, ''))),
    lower(btrim(parent_email))
  )
  WHERE school_id IS NOT NULL
    AND parent_email IS NOT NULL
    AND coalesce(is_deleted, false) = false;
