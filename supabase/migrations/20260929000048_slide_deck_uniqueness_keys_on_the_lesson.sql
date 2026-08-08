-- Key the slide-deck guard on the lesson, not on the plan and week.
--
-- 20260929000043 keyed it on (lesson_plan_id, curriculum_week_number,
-- file_type). That is the wrong grain and it was wrong on arrival: a plan can
-- hold more than one lesson in the same week, and this database already does.
-- Plan 8c81306a has two lessons in week 2, and Summer School 2026 runs two
-- separate week-1 lessons — AI Explorers and Sparking Creativity — which are
-- different teaching, not a duplicate.
--
-- Under the old index the second of those could never own a slide deck. The
-- first one to generate would take the slot and every later attempt would be
-- rejected as a duplicate, which is worse than the problem the index was added
-- to solve: not a duplicate deck, but a lesson permanently unable to have one.
--
-- The app has always dedicated on the lesson — generate-slides looks up the
-- newest slide-deck `.eq('lesson_id', lesson.id)` — so the index now matches
-- what the code actually asks. Verified clean before creating: zero
-- (lesson_id, file_type) duplicates exist.
--
-- Uploaded materials stay excluded exactly as before: a teacher may attach as
-- many PDFs and links to one lesson as they need.

drop index if exists public.uq_lesson_materials_generated_plan_week;

create unique index if not exists uq_lesson_materials_slide_deck_per_lesson
  on public.lesson_materials (lesson_id, file_type)
  where lesson_id is not null
    and file_type = 'slide-deck';

comment on index public.uq_lesson_materials_slide_deck_per_lesson is
  'One generated slide deck per lesson. Replaces the plan+week key from 20260929000043, which could not express two lessons taught in the same week of one plan.';
