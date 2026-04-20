-- Add school visibility toggle to course_curricula
-- Teachers can hide specific curriculum delivery progress from partner schools
ALTER TABLE public.course_curricula
  ADD COLUMN IF NOT EXISTS is_visible_to_school boolean NOT NULL DEFAULT true;
