-- One academic identity direction:
-- class plan (lesson_plans.id) -> lessons.lesson_plan_id -> delivery evidence.
--
-- The retired lesson_plans.lesson_id column represented a second, reverse
-- ownership model. The application now keeps that lesson-level detail in
-- lessons.metadata.teaching_guide. Refuse to drop the column if a deployment
-- has acquired legacy rows since the pre-migration audit so no content can be
-- removed silently.

do $$
declare
  reverse_plan_count bigint := 0;
  orphan_count bigint := 0;
  asset_table text;
begin
  -- 00087 installed a compatibility trigger that mirrored the canonical
  -- foreign keys back into metadata. That trigger would immediately recreate
  -- the key while this migration removes it, so retire the mirror first.
  foreach asset_table in array array['lessons', 'assignments', 'lesson_materials', 'flashcard_decks'] loop
    execute format(
      'drop trigger if exists sync_teaching_content_metadata_identity on public.%I',
      asset_table
    );
  end loop;
  drop function if exists public.sync_teaching_content_metadata_identity();
  drop index if exists public.idx_lessons_metadata_lesson_plan_id;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lesson_plans'
      and column_name = 'lesson_id'
  ) then
    execute 'select count(*) from public.lesson_plans where lesson_id is not null'
      into reverse_plan_count;

    if reverse_plan_count > 0 then
      raise exception using
        message = format(
          'Cannot remove lesson_plans.lesson_id: %s reverse-linked plan row(s) require migration first.',
          reverse_plan_count
        ),
        hint = 'Move each row''s teaching detail to lessons.metadata.teaching_guide, verify it, then retry.';
    end if;
  end if;

  -- Metadata mirrors are safe to remove only when the real foreign-key
  -- column exists. An orphan would otherwise become invisible, so abort and
  -- require an explicit repair instead of silently losing its scope.
  foreach asset_table in array array['lessons', 'assignments', 'lesson_materials', 'flashcard_decks', 'exams', 'cbt_exams'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = asset_table and column_name = 'metadata'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = asset_table and column_name = 'lesson_plan_id'
    ) then
      execute format(
        'select count(*) from public.%I where lesson_plan_id is null and metadata ? ''lesson_plan_id''',
        asset_table
      ) into orphan_count;
      if orphan_count > 0 then
        raise exception using
          message = format(
            'Cannot remove metadata lesson_plan_id from public.%I: %s orphan asset row(s) require migration first.',
            asset_table,
            orphan_count
          ),
          hint = 'Repair the real lesson_plan_id foreign key for each row, then retry.';
      end if;
    end if;
  end loop;
end
$$;

-- The foreign-key columns are now authoritative. Remove only the duplicated
-- metadata key; all lesson bodies, slides, cards, assignments and submissions
-- remain untouched. Published-week locks normally forbid metadata edits; drop
-- those guards only for this mirror-key cleanup, then restore them.
drop trigger if exists protect_locked_lesson on public.lessons;
drop trigger if exists protect_locked_assignment on public.assignments;

do $$
declare
  asset_table text;
begin
  foreach asset_table in array array['lessons', 'assignments', 'lesson_materials', 'flashcard_decks', 'exams', 'cbt_exams'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = asset_table and column_name = 'metadata'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = asset_table and column_name = 'lesson_plan_id'
    ) then
      execute format(
        'update public.%I set metadata = metadata - ''lesson_plan_id'' where lesson_plan_id is not null and metadata ? ''lesson_plan_id''',
        asset_table
      );
    end if;
  end loop;
end
$$;

create trigger protect_locked_lesson
  before update or delete on public.lessons
  for each row execute function public.protect_locked_generated_content('lesson');

create trigger protect_locked_assignment
  before update or delete on public.assignments
  for each row execute function public.protect_locked_generated_content('assignment');

alter table public.lesson_plans
  drop constraint if exists lesson_plans_lesson_id_fkey;

alter table public.lesson_plans
  drop constraint if exists lesson_plans_lesson_id_unique;

alter table public.lesson_plans
  drop column if exists lesson_id;

comment on table public.lesson_plans is
  'Canonical class teaching plans. Child lessons reference lesson_plans.id through lessons.lesson_plan_id.';
