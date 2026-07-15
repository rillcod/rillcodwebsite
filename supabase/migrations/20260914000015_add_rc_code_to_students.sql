-- Add rc_code to students table for tracking access card validation code
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS rc_code text;

COMMENT ON COLUMN public.students.rc_code IS
  'The Registration Code (RC) from the partner school access card used during registration.';

CREATE INDEX IF NOT EXISTS idx_students_rc_code
  ON public.students (rc_code)
  WHERE rc_code IS NOT NULL;
