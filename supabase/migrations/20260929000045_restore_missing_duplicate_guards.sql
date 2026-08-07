-- Restore the duplicate guards 20260929000024 was supposed to create.
--
-- Verified against the live database on 2026-08-07: of the five uniqueness
-- indexes this repo believes it has, only two existed.
--
--   uq_lessons_generated_any_writer_plan_week   present  (20260929000030)
--   uq_lesson_materials_generated_plan_week     present  (20260929000043)
--   uq_lessons_generated_plan_week              MISSING  (20260929000024)
--   uq_assignments_generated_plan_week_type     MISSING  (20260929000024)
--   uq_flashcard_decks_generated_plan_week      MISSING  (20260929000024)
--
-- 20260929000024 never ran. Nothing reported that, because a migration that is
-- not applied does not fail — it is simply absent, and every later file that
-- assumed its indexes existed carried on assuming. `schema_migrations` records
-- 76 versions against 97 files in the repo, so this is very unlikely to be the
-- only one; that gap is worth an audit separately from this file.
--
-- It matters more now than it did last week. Copying a week between classes is
-- fast enough for two sweep runs to overlap, and the app-side checks are the
-- only thing standing in front of these two tables. 20260929000030 records
-- exactly where that ends: the same maybeSingle() pattern let one class reach
-- four copies of its Week 1 lesson, because maybeSingle ERRORS on more than one
-- row and the error read as "nothing there".
--
-- Safe to run: both tables were checked for existing violations first and had
-- none. Written idempotently so it stays safe if 24 is ever replayed.

-- Assignments and projects share this table and are told apart by
-- assignment_type plus the route marker, so the key must carry both. Without
-- assignment_type a week could hold a project OR homework but never both.
create unique index if not exists uq_assignments_generated_plan_week_type
  on public.assignments (
    lesson_plan_id,
    curriculum_week_number,
    assignment_type,
    (metadata->>'generated_from')
  )
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and metadata->>'generated_from' in (
      'progression_assignment_route',
      'progression_project_route'
    );

-- Decks are one per plan/week regardless of writer: unlike assignments there is
-- no second kind of deck to tell apart.
create unique index if not exists uq_flashcard_decks_generated_plan_week
  on public.flashcard_decks (lesson_plan_id, curriculum_week_number)
  where lesson_plan_id is not null
    and curriculum_week_number is not null;

-- uq_lessons_generated_plan_week is deliberately NOT recreated.
-- 20260929000030 replaced it with a strictly wider index covering every writer,
-- not just generated_from='progression_lesson_route'. Adding the narrow one
-- back would index the same rows a second time for no additional guarantee.

comment on index public.uq_assignments_generated_plan_week_type is
  'One generated assignment and one generated project per plan/week. Restored by 20260929000045 after 20260929000024 was found never to have been applied.';

comment on index public.uq_flashcard_decks_generated_plan_week is
  'One generated deck per plan/week. Restored by 20260929000045 after 20260929000024 was found never to have been applied.';
