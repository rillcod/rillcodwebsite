-- One generated lesson per plan per week, whichever writer produced it.
--
-- 20260929000024 already tried this, but its index only covers lessons tagged
-- metadata->>'generated_from' = 'progression_lesson_route'. Three different code
-- paths write these lessons and they do not agree on the tag:
--
--   progression_lesson_route        -> metadata.generated_from   (covered)
--   ai_special_programme_launcher   -> metadata.generated_by     (not covered)
--   special_program_launcher        -> metadata.generated_by     (not covered)
--
-- So the guard never applied to the special-programme launcher, and the app-side
-- check could not compensate: it used maybeSingle(), which ERRORS on more than
-- one match, and the error was discarded — reading as "no lesson exists" and
-- inserting another. Every Prepare-teaching click added one. AI Foundations &
-- Python Programming reached four copies of its Week 1 lesson that way.
--
-- This index keys on plan + week for ANY generated lesson, regardless of which
-- key carries the marker. Manual lessons (no generated marker) are untouched.

create unique index if not exists uq_lessons_generated_any_writer_plan_week
  on public.lessons(lesson_plan_id, curriculum_week_number)
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and (metadata ? 'generated_from' or metadata ? 'generated_by');

comment on index public.uq_lessons_generated_any_writer_plan_week is
  'One generated lesson per plan/week no matter which launcher wrote it. The older uq_lessons_generated_plan_week only matched generated_from=progression_lesson_route, so the special-programme launchers slipped past it.';
