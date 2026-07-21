-- Canonical evaluation scope. Additive only: existing CBT sessions and report consumers stay unchanged.
ALTER TABLE public.cbt_exams
  ADD COLUMN IF NOT EXISTS class_id uuid NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lesson_plan_id uuid NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lesson_id uuid NULL REFERENCES public.lessons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curriculum_week_number integer NULL CHECK (curriculum_week_number BETWEEN 1 AND 53);

UPDATE public.cbt_exams e
SET class_id=(e.metadata->>'target_class_id')::uuid
WHERE e.class_id IS NULL
  AND e.metadata->>'target_class_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id=(e.metadata->>'target_class_id')::uuid);

UPDATE public.cbt_exams e
SET lesson_plan_id=(e.metadata->>'lesson_plan_id')::uuid
WHERE e.lesson_plan_id IS NULL
  AND e.metadata->>'lesson_plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.lesson_plans p WHERE p.id=(e.metadata->>'lesson_plan_id')::uuid);

UPDATE public.cbt_exams e
SET lesson_id=(e.metadata->>'lesson_id')::uuid
WHERE e.lesson_id IS NULL
  AND e.metadata->>'lesson_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=(e.metadata->>'lesson_id')::uuid);

UPDATE public.cbt_exams e
SET curriculum_week_number=CASE
      WHEN COALESCE(e.metadata->>'week','') ~ '^\d{1,2}$' THEN (e.metadata->>'week')::integer
      ELSE NULL END
WHERE e.curriculum_week_number IS NULL;

UPDATE public.cbt_exams e
SET class_id=COALESCE(e.class_id,p.class_id),
    course_id=COALESCE(e.course_id,p.course_id),
    term_id=COALESCE(e.term_id,p.term_id),
    school_id=COALESCE(e.school_id,p.school_id)
FROM public.lesson_plans p
WHERE e.lesson_plan_id=p.id;

CREATE INDEX IF NOT EXISTS idx_cbt_exams_class_term ON public.cbt_exams(class_id,term_id) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cbt_exams_lesson_plan ON public.cbt_exams(lesson_plan_id) WHERE lesson_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cbt_exams_lesson ON public.cbt_exams(lesson_id) WHERE lesson_id IS NOT NULL;

COMMENT ON COLUMN public.cbt_exams.class_id IS 'Canonical class receiving this evaluation.';
COMMENT ON COLUMN public.cbt_exams.lesson_plan_id IS 'Canonical class term plan that produced this evaluation.';
COMMENT ON COLUMN public.cbt_exams.lesson_id IS 'Optional lesson evaluated by this CBT.';
COMMENT ON COLUMN public.cbt_exams.curriculum_week_number IS 'Curriculum week evaluated by this CBT.';