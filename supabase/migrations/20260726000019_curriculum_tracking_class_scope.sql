-- Scope syllabus delivery tracking to the actual class implementation.
-- Without this, two classes using the same curriculum version overwrite each
-- other's week progress.

ALTER TABLE public.curriculum_week_tracking
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_curriculum_week_tracking_class
  ON public.curriculum_week_tracking(class_id);

CREATE INDEX IF NOT EXISTS idx_curriculum_week_tracking_lesson_plan
  ON public.curriculum_week_tracking(lesson_plan_id);

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_week_tracking_unique_plan_week
  ON public.curriculum_week_tracking(curriculum_id, school_id, class_id, lesson_plan_id, term_number, week_number)
  WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND lesson_plan_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_week_tracking_unique_class_week
  ON public.curriculum_week_tracking(curriculum_id, school_id, class_id, term_number, week_number)
  WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND lesson_plan_id IS NULL;

