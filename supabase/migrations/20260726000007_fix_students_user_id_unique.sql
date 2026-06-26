-- Fix: the partial unique index (WHERE user_id IS NOT NULL) cannot be used as an
-- ON CONFLICT (user_id) arbiter, so the ensure_student_shadow_row trigger (and the
-- app's upsert onConflict:'user_id') errored on every student insert. Replace it
-- with a plain unique index — Postgres keeps multiple NULL user_ids distinct, so
-- pre-portal rows (user_id NULL) are unaffected while non-null ids stay unique.
DROP INDEX IF EXISTS public.uq_students_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_user_id
  ON public.students (user_id);
