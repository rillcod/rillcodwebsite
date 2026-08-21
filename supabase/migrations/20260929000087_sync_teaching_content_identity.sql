-- Keep every teaching-content surface on the same class-plan identity.
--
-- Canonical columns were introduced after legacy metadata links. Curriculum
-- reuse repointed the columns but could carry the source plan id in metadata,
-- so column-aware screens showed content that metadata-aware automation hid.

create or replace function public.sync_teaching_content_metadata_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  -- Published lessons and assignments are historical records. Their canonical
  -- identity columns are still authoritative, but their frozen metadata must
  -- not be rewritten by this compatibility mirror.
  if nullif(to_jsonb(new) ->> 'content_locked_at', '') is not null then
    return new;
  end if;

  if new.lesson_plan_id is not null then
    new.metadata := new.metadata || jsonb_build_object(
      'lesson_plan_id', new.lesson_plan_id::text,
      'class_id', case when new.class_id is null then null else new.class_id::text end,
      'week', new.curriculum_week_number,
      'week_number', new.curriculum_week_number,
      'session', new.session_number,
      'session_number', new.session_number
    );
  end if;

  return new;
end;
$$;

-- Recover any last metadata-only legacy links before the canonical column
-- becomes the source mirrored back into metadata.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'lessons',
    'assignments',
    'flashcard_decks',
    'lesson_materials'
  ] loop
    execute format($sql$
      update public.%I row
      set lesson_plan_id = plan.id,
          class_id = coalesce(row.class_id, plan.class_id),
          curriculum_week_number = coalesce(
            row.curriculum_week_number,
            case
              when coalesce(row.metadata ->> 'week_number', row.metadata ->> 'week', '') ~ '^[0-9]+$'
                and (coalesce(row.metadata ->> 'week_number', row.metadata ->> 'week'))::integer between 1 and 53
              then (coalesce(row.metadata ->> 'week_number', row.metadata ->> 'week'))::integer
              else null
            end
          ),
          session_number = coalesce(
            row.session_number,
            case
              when coalesce(row.metadata ->> 'session_number', row.metadata ->> 'session', '') ~ '^[0-9]+$'
                and (coalesce(row.metadata ->> 'session_number', row.metadata ->> 'session'))::integer between 1 and 20
              then (coalesce(row.metadata ->> 'session_number', row.metadata ->> 'session'))::integer
              else 1
            end
          )
      from public.lesson_plans plan
      where row.lesson_plan_id is null
        and coalesce(row.metadata ->> 'lesson_plan_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and plan.id = (row.metadata ->> 'lesson_plan_id')::uuid
    $sql$, table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'lessons',
    'assignments',
    'flashcard_decks',
    'lesson_materials'
  ] loop
    execute format(
      'drop trigger if exists sync_teaching_content_metadata_identity on public.%I',
      table_name
    );
    execute format(
      'create trigger sync_teaching_content_metadata_identity before insert or update of lesson_plan_id, class_id, curriculum_week_number, session_number, metadata on public.%I for each row execute function public.sync_teaching_content_metadata_identity()',
      table_name
    );
  end loop;
end;
$$;

update public.lessons
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'lesson_plan_id', lesson_plan_id::text,
  'class_id', case when class_id is null then null else class_id::text end,
  'week', curriculum_week_number,
  'week_number', curriculum_week_number,
  'session', session_number,
  'session_number', session_number
)
where lesson_plan_id is not null
  and content_locked_at is null
  and (
    metadata ->> 'lesson_plan_id' is distinct from lesson_plan_id::text
    or metadata ->> 'class_id' is distinct from class_id::text
    or metadata ->> 'week' is distinct from curriculum_week_number::text
    or metadata ->> 'session' is distinct from session_number::text
  );

update public.assignments
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'lesson_plan_id', lesson_plan_id::text,
  'class_id', case when class_id is null then null else class_id::text end,
  'week', curriculum_week_number,
  'week_number', curriculum_week_number,
  'session', session_number,
  'session_number', session_number
)
where lesson_plan_id is not null
  and content_locked_at is null
  and (
    metadata ->> 'lesson_plan_id' is distinct from lesson_plan_id::text
    or metadata ->> 'class_id' is distinct from class_id::text
    or metadata ->> 'week' is distinct from curriculum_week_number::text
    or metadata ->> 'session' is distinct from session_number::text
  );

update public.flashcard_decks
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'lesson_plan_id', lesson_plan_id::text,
  'class_id', case when class_id is null then null else class_id::text end,
  'week', curriculum_week_number,
  'week_number', curriculum_week_number,
  'session', session_number,
  'session_number', session_number
)
where lesson_plan_id is not null
  and (
    metadata ->> 'lesson_plan_id' is distinct from lesson_plan_id::text
    or metadata ->> 'class_id' is distinct from class_id::text
    or metadata ->> 'week' is distinct from curriculum_week_number::text
    or metadata ->> 'session' is distinct from session_number::text
  );

update public.lesson_materials
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'lesson_plan_id', lesson_plan_id::text,
  'class_id', case when class_id is null then null else class_id::text end,
  'week', curriculum_week_number,
  'week_number', curriculum_week_number,
  'session', session_number,
  'session_number', session_number
)
where lesson_plan_id is not null
  and (
    metadata ->> 'lesson_plan_id' is distinct from lesson_plan_id::text
    or metadata ->> 'class_id' is distinct from class_id::text
    or metadata ->> 'week' is distinct from curriculum_week_number::text
    or metadata ->> 'session' is distinct from session_number::text
  );

comment on function public.sync_teaching_content_metadata_identity() is
  'Mirrors canonical class-plan/week/session columns into legacy content metadata so all teaching surfaces and automation resolve the same assets.';
