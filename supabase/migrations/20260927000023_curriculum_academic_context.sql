-- Human academic context for official curriculum editions and school adoption.
-- Numeric IDs remain internal; every edition is session and term sensitive.

ALTER TABLE public.academic_curriculum_releases
  ADD COLUMN IF NOT EXISTS academic_session text NOT NULL DEFAULT (
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9
        THEN EXTRACT(YEAR FROM CURRENT_DATE)::integer::text || '/' || (EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1)::text
      ELSE (EXTRACT(YEAR FROM CURRENT_DATE)::integer - 1)::text || '/' || EXTRACT(YEAR FROM CURRENT_DATE)::integer::text
    END
  ),
  ADD COLUMN IF NOT EXISTS effective_term_number integer NOT NULL DEFAULT (
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 9 AND 12 THEN 1
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 1 AND 4 THEN 2
      ELSE 3
    END
  ) CHECK (effective_term_number BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS grade_key text,
  ADD COLUMN IF NOT EXISTS audience_label text;

ALTER TABLE public.academic_curriculum_adoptions
  ADD COLUMN IF NOT EXISTS academic_session text,
  ADD COLUMN IF NOT EXISTS effective_academic_term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL;

UPDATE public.academic_curriculum_adoptions a
SET academic_session = r.academic_session
FROM public.academic_curriculum_releases r
WHERE r.id = a.release_id AND a.academic_session IS NULL;

CREATE INDEX IF NOT EXISTS idx_academic_curriculum_release_session
  ON public.academic_curriculum_releases(academic_session, effective_term_number, course_id);
CREATE INDEX IF NOT EXISTS idx_academic_curriculum_adoption_session
  ON public.academic_curriculum_adoptions(school_id, academic_session, course_id);

COMMENT ON COLUMN public.academic_curriculum_releases.academic_session IS
  'Human academic year such as 2026/2027; never inferred from release timestamps in UI.';
COMMENT ON COLUMN public.academic_curriculum_releases.effective_term_number IS
  '1=First Term, 2=Second Term, 3=Third Term. UI must display the human label.';
COMMENT ON COLUMN public.academic_curriculum_releases.grade_key IS
  'Optional audience key such as basic_1 or jss_1; display via curriculum human-label helpers.';
