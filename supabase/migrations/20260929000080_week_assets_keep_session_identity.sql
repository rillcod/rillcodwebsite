-- App-level week identity has always included the meeting number, but generated
-- content uniqueness and reuse were keyed on week alone. Persist that dimension
-- so Class 1 and Class 2 cannot collide or copy each other's material.

alter table public.lessons
  add column if not exists session_number integer;
alter table public.assignments
  add column if not exists session_number integer;
alter table public.flashcard_decks
  add column if not exists session_number integer;
alter table public.lesson_materials
  add column if not exists session_number integer;

update public.lessons
set session_number = coalesce(
  case when metadata ->> 'session' ~ '^[0-9]+$'
    then (metadata ->> 'session')::integer end,
  case when metadata ->> 'session_number' ~ '^[0-9]+$'
    then (metadata ->> 'session_number')::integer end,
  1
)
where session_number is null;

update public.assignments
set session_number = coalesce(
  case when metadata ->> 'session' ~ '^[0-9]+$'
    then (metadata ->> 'session')::integer end,
  case when metadata ->> 'session_number' ~ '^[0-9]+$'
    then (metadata ->> 'session_number')::integer end,
  1
)
where session_number is null;

update public.flashcard_decks
set session_number = coalesce(
  nullif(substring(title from '(?i)session[[:space:]]+([0-9]+)'), '')::integer,
  1
)
where session_number is null;

update public.lesson_materials
set session_number = coalesce(
  nullif(substring(file_url from '"session"[[:space:]]*:[[:space:]]*([0-9]+)'), '')::integer,
  nullif(substring(title from '(?i)session[[:space:]]+([0-9]+)'), '')::integer,
  1
)
where session_number is null;

alter table public.lessons
  alter column session_number set default 1,
  alter column session_number set not null,
  drop constraint if exists lessons_session_number_check,
  add constraint lessons_session_number_check check (session_number between 1 and 20);

alter table public.assignments
  alter column session_number set default 1,
  alter column session_number set not null,
  drop constraint if exists assignments_session_number_check,
  add constraint assignments_session_number_check check (session_number between 1 and 20);

alter table public.flashcard_decks
  alter column session_number set default 1,
  alter column session_number set not null,
  drop constraint if exists flashcard_decks_session_number_check,
  add constraint flashcard_decks_session_number_check check (session_number between 1 and 20);

alter table public.lesson_materials
  alter column session_number set default 1,
  alter column session_number set not null,
  drop constraint if exists lesson_materials_session_number_check,
  add constraint lesson_materials_session_number_check check (session_number between 1 and 20);

drop index if exists public.uq_lessons_generated_any_writer_plan_week;
create unique index uq_lessons_generated_any_writer_plan_week_session
  on public.lessons (
    lesson_plan_id,
    curriculum_week_number,
    session_number
  )
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and (metadata ? 'generated_from' or metadata ? 'generated_by');

drop index if exists public.uq_assignments_generated_plan_week_type;
create unique index uq_assignments_generated_plan_week_session_type
  on public.assignments (
    lesson_plan_id,
    curriculum_week_number,
    session_number,
    assignment_type,
    (metadata ->> 'generated_from')
  )
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and metadata ->> 'generated_from' in (
      'progression_assignment_route',
      'progression_project_route'
    );

drop index if exists public.uq_flashcard_decks_generated_plan_week;
create unique index uq_flashcard_decks_generated_plan_week_session
  on public.flashcard_decks (
    lesson_plan_id,
    curriculum_week_number,
    session_number
  )
  where lesson_plan_id is not null
    and curriculum_week_number is not null;

create index if not exists lessons_release_week_session_idx
  on public.lessons (
    curriculum_release_id,
    curriculum_week_number,
    session_number
  )
  where curriculum_release_id is not null;

create index if not exists assignments_release_week_session_idx
  on public.assignments (
    curriculum_release_id,
    curriculum_week_number,
    session_number
  )
  where curriculum_release_id is not null;

create index if not exists flashcard_decks_release_week_session_idx
  on public.flashcard_decks (
    curriculum_release_id,
    curriculum_week_number,
    session_number
  )
  where curriculum_release_id is not null;

create index if not exists lesson_materials_release_week_session_idx
  on public.lesson_materials (
    curriculum_release_id,
    curriculum_week_number,
    session_number
  )
  where curriculum_release_id is not null;

comment on column public.lessons.session_number is
  '1-based class meeting within curriculum_week_number; 1 for single-session school weeks.';
comment on column public.assignments.session_number is
  '1-based class meeting within curriculum_week_number; 1 for single-session school weeks.';
comment on column public.flashcard_decks.session_number is
  '1-based class meeting within curriculum_week_number; 1 for single-session school weeks.';
comment on column public.lesson_materials.session_number is
  '1-based class meeting within curriculum_week_number; 1 for single-session school weeks.';
