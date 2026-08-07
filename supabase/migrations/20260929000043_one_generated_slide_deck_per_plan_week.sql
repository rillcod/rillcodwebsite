-- One generated slide deck per plan per week.
--
-- lesson_materials was the only one of the four content tables with no
-- uniqueness guard. lessons, assignments and flashcard_decks each got one in
-- 20260929000024 and 20260929000030; slides were added to the pipeline later
-- and never did.
--
-- Until now the app-side check carried it alone: generate-slides reads the
-- newest slide-deck for the lesson and skips if one exists. 20260929000030
-- documents exactly how that argument ends — the lessons table had the same
-- app-side check, it used maybeSingle(), maybeSingle ERRORS on more than one
-- row, the error was read as "nothing there", and one class reached four copies
-- of its Week 1 lesson. An app check is a race; an index is a rule.
--
-- It matters more now that decks are copied between classes rather than
-- generated per class, because a copy is fast enough for two runs to overlap.
--
-- Scoped to generated decks only. A teacher may upload as many PDFs and links
-- to one lesson as they like — those are file_type 'pdf' and 'link', carry no
-- generated marker, and are untouched by this.
-- Duplicates are cleared first, because a unique index cannot be created over
-- data that already violates it — the statement fails and takes the whole
-- migration with it. This table has never had a guard and its app-side check is
-- the same maybeSingle() pattern that let four copies of one lesson through, so
-- assuming the data is already clean is exactly the assumption that breaks the
-- deploy.
--
-- Only shadowed rows go. generate-slides reads a lesson's newest slide-deck and
-- ignores the rest, so every row removed here is one nothing could reach. The
-- newest is kept, which is the one the app has been serving all along.
--
-- Their storage objects are deliberately left in place. Deleting files during a
-- schema migration is not recoverable, and orphaned SVGs cost almost nothing
-- next to the risk of removing one still referenced by a row this query has not
-- considered.
with shadowed as (
  select id
  from (
    select id,
           row_number() over (
             partition by lesson_plan_id, curriculum_week_number, file_type
             order by created_at desc, id desc
           ) as rank
    from public.lesson_materials
    where lesson_plan_id is not null
      and curriculum_week_number is not null
      and file_type = 'slide-deck'
  ) ranked
  where rank > 1
)
delete from public.lesson_materials m
using shadowed s
where m.id = s.id;

create unique index if not exists uq_lesson_materials_generated_plan_week
  on public.lesson_materials (lesson_plan_id, curriculum_week_number, file_type)
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and file_type = 'slide-deck';

comment on index public.uq_lesson_materials_generated_plan_week is
  'One generated slide deck per plan/week. Uploaded materials (pdf, link) are excluded, so a teacher can still attach as many files to a lesson as they need.';
