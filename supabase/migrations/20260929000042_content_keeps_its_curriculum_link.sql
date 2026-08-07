-- Keep the curriculum link true without another backfill.
--
-- 20260929000041 gave every piece of generated content a curriculum_release_id
-- copied from the plan it belongs to. That is only true as of the moment it
-- ran: the routes still write lesson_plan_id and nothing else, so the next
-- generated lesson would arrive with the new column empty and the set would
-- drift apart again — and the second backfill is always the one nobody
-- remembers to run.
--
-- A trigger keeps it true at the point of writing. The plan already records
-- which curriculum edition it was built from, so this copies a fact that is one
-- join away rather than deciding anything.
--
-- Content with no plan is left alone deliberately. Six rows are in that state —
-- assignments and decks a teacher made directly rather than generating from a
-- curriculum. They have no curriculum lineage because they genuinely have none,
-- and inventing one would offer a teacher's own material up to be shared with
-- other schools. No plan means no release means class-local, which is correct.

create or replace function public.content_inherits_curriculum_from_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release uuid;
begin
  -- Only fill a gap; never overwrite a link already set, so content that has
  -- been deliberately repointed stays where it was put.
  if new.curriculum_release_id is not null then return new; end if;
  if new.lesson_plan_id is null then return new; end if;

  select curriculum_release_id into v_release
    from public.lesson_plans
   where id = new.lesson_plan_id;

  if v_release is not null then
    new.curriculum_release_id := v_release;
  end if;

  return new;
end;
$$;

comment on function public.content_inherits_curriculum_from_plan() is
  'Copies curriculum_release_id from a content row''s lesson plan when it is not already set, so generated content keeps knowing which curriculum edition it came from without a repeated backfill. Leaves plan-less content alone: no plan means no curriculum lineage, which is correct for material a teacher wrote directly.';

drop trigger if exists lessons_inherit_curriculum on public.lessons;
create trigger lessons_inherit_curriculum
  before insert or update of lesson_plan_id on public.lessons
  for each row execute function public.content_inherits_curriculum_from_plan();

drop trigger if exists assignments_inherit_curriculum on public.assignments;
create trigger assignments_inherit_curriculum
  before insert or update of lesson_plan_id on public.assignments
  for each row execute function public.content_inherits_curriculum_from_plan();

drop trigger if exists flashcard_decks_inherit_curriculum on public.flashcard_decks;
create trigger flashcard_decks_inherit_curriculum
  before insert or update of lesson_plan_id on public.flashcard_decks
  for each row execute function public.content_inherits_curriculum_from_plan();

drop trigger if exists lesson_materials_inherit_curriculum on public.lesson_materials;
create trigger lesson_materials_inherit_curriculum
  before insert or update of lesson_plan_id on public.lesson_materials
  for each row execute function public.content_inherits_curriculum_from_plan();
