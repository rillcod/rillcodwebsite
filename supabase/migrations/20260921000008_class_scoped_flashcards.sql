-- Attach flashcard study material to the same class teaching scope as lessons and plans.
ALTER TABLE public.flashcard_decks
  ADD COLUMN IF NOT EXISTS class_id uuid NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lesson_plan_id uuid NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS curriculum_week_number integer NULL CHECK (curriculum_week_number BETWEEN 1 AND 53);

UPDATE public.flashcard_decks d
SET class_id=l.class_id,
    lesson_plan_id=l.lesson_plan_id,
    curriculum_week_number=l.curriculum_week_number,
    term_id=COALESCE(d.term_id,l.academic_term_id)
FROM public.lessons l
WHERE d.lesson_id=l.id
  AND (d.class_id IS NULL OR d.lesson_plan_id IS NULL OR d.curriculum_week_number IS NULL);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_class_term
  ON public.flashcard_decks(class_id,term_id) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_lesson_plan
  ON public.flashcard_decks(lesson_plan_id) WHERE lesson_plan_id IS NOT NULL;

-- A title may be reused by different classes in the same term without collision.
DROP INDEX IF EXISTS public.uq_flashcard_decks_owner_title_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_flashcard_decks_owner_title_scope
  ON public.flashcard_decks (
    created_by,
    lower(btrim(title)),
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(lesson_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

COMMENT ON COLUMN public.flashcard_decks.class_id IS 'Canonical class receiving this deck.';
COMMENT ON COLUMN public.flashcard_decks.lesson_plan_id IS 'Canonical class term plan that produced this deck.';
COMMENT ON COLUMN public.flashcard_decks.curriculum_week_number IS 'Curriculum week within the canonical class plan.';