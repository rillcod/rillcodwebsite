-- Partner public enrolment: only flagged schools appear on the student form.
-- Term vs holiday are tracked separately on students.partner_program_track.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS public_enrollment_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.public_enrollment_open IS
  'When true, this school appears on public partner-school registration (keep to live partners only).';

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS partner_program_track text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_partner_program_track_check'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_partner_program_track_check
      CHECK (
        partner_program_track IS NULL
        OR partner_program_track IN ('term', 'holiday')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.students.partner_program_track IS
  'Partner-school track: term (in-session) vs holiday (vacation) — distinct from enrollment_type and from Summer special.';

CREATE INDEX IF NOT EXISTS idx_students_partner_program_track
  ON public.students (partner_program_track)
  WHERE partner_program_track IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schools_public_enrollment_open
  ON public.schools (public_enrollment_open)
  WHERE public_enrollment_open = true;

-- Backfill track from preferred_schedule / goals for existing partner rows.
UPDATE public.students
SET partner_program_track = CASE
  WHEN preferred_schedule = 'Holiday Programme' OR goals = 'Holiday Programme' THEN 'holiday'
  WHEN preferred_schedule IN ('Termly Programme', 'Weekday Afternoons', 'Weekend In-Person')
    OR goals IN ('Termly Programme', 'Weekday Afternoons', 'Weekend In-Person') THEN 'term'
  ELSE partner_program_track
END
WHERE enrollment_type = 'school'
  AND partner_program_track IS NULL
  AND (
    preferred_schedule IS NOT NULL
    OR goals IS NOT NULL
  );

-- IMPORTANT: turn on exactly your two live partners after deploy, e.g.:
-- UPDATE public.schools SET public_enrollment_open = true
-- WHERE name IN ('SCHOOL NAME ONE', 'SCHOOL NAME TWO');
