-- Consolidate historical generator duplicates without touching learner scores,
-- submissions, progress or delivery evidence.
--
-- The pre-unification scheduler could generate the same plan/week/session more
-- than once. Keep the live/locked lesson when one exists (otherwise the oldest
-- draft), move every dependent record to it, retain one slide deck, and then
-- enforce the identity the application already treats as canonical.

create temporary table _lesson_duplicate_map on commit drop as
with ranked as (
  select
    id,
    first_value(id) over (
      partition by lesson_plan_id, curriculum_week_number, session_number
      order by
        case when status <> 'draft' then 0 else 1 end,
        case when content_locked_at is not null then 0 else 1 end,
        created_at nulls last,
        id
    ) as canonical_id,
    row_number() over (
      partition by lesson_plan_id, curriculum_week_number, session_number
      order by
        case when status <> 'draft' then 0 else 1 end,
        case when content_locked_at is not null then 0 else 1 end,
        created_at nulls last,
        id
    ) as rank_in_package
  from public.lessons
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and session_number is not null
)
select id as duplicate_id, canonical_id
from ranked
where rank_in_package > 1;

update public.academic_assessment_evidence row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.assignments row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.cbt_exams row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.class_lesson_delivery row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.exams row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.flashcard_decks row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.lab_projects row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

-- lesson_materials already enforces one file type per lesson. Choose the
-- material to retain before relinking so consolidation never passes through a
-- transient duplicate (lesson_id, file_type) state.
create temporary table _duplicate_lesson_materials on commit drop as
with candidates as (
  select
    material.id,
    coalesce(map.canonical_id, material.lesson_id) as target_lesson_id,
    material.file_type,
    row_number() over (
      partition by coalesce(map.canonical_id, material.lesson_id), material.file_type
      order by
        case when map.duplicate_id is null then 0 else 1 end,
        case when material.is_public is true then 0 else 1 end,
        material.created_at nulls last,
        material.id
    ) as rank_for_target
  from public.lesson_materials material
  left join _lesson_duplicate_map map
    on map.duplicate_id = material.lesson_id
  where material.lesson_id in (
    select duplicate_id from _lesson_duplicate_map
    union
    select canonical_id from _lesson_duplicate_map
  )
)
select id
from candidates
where rank_for_target > 1;

delete from public.lesson_materials material
using _duplicate_lesson_materials duplicate
where material.id = duplicate.id;

update public.lesson_materials row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.lesson_plans row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.lesson_progress row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.session_recordings row
set lesson_id = map.canonical_id
from _lesson_duplicate_map map
where row.lesson_id = map.duplicate_id;

update public.lessons row
set shared_master_id = map.canonical_id
from _lesson_duplicate_map map
where row.shared_master_id = map.duplicate_id
  and row.id <> map.canonical_id;

delete from public.lessons lesson
using _lesson_duplicate_map map
where lesson.id = map.duplicate_id;

-- After relinking, repeated generated slides occupy the same package. Prefer a
-- deck already attached to the canonical lesson, then preserve a public deck,
-- then the oldest copy. No score or learner evidence references these rows.
create temporary table _slide_duplicates on commit drop as
with ranked as (
  select
    material.id,
    row_number() over (
      partition by material.lesson_plan_id,
                   material.curriculum_week_number,
                   material.session_number,
                   material.file_type
      order by
        case when material.lesson_id = lesson.id then 0 else 1 end,
        case when material.is_public is true then 0 else 1 end,
        material.created_at nulls last,
        material.id
    ) as rank_in_package
  from public.lesson_materials material
  left join public.lessons lesson
    on lesson.lesson_plan_id = material.lesson_plan_id
   and lesson.curriculum_week_number = material.curriculum_week_number
   and lesson.session_number = material.session_number
  where material.lesson_plan_id is not null
    and material.curriculum_week_number is not null
    and material.session_number is not null
    and material.file_type = 'slide-deck'
)
select id
from ranked
where rank_in_package > 1;

delete from public.lesson_materials material
using _slide_duplicates duplicate
where material.id = duplicate.id;

-- Slides generated by the old flow were made public immediately even while
-- the lesson/package remained held. Restore the conservative held state. A
-- package whose lesson is already live remains live and is never downgraded.
update public.lesson_materials material
set is_public = false
where material.lesson_plan_id is not null
  and material.file_type = 'slide-deck'
  and material.is_public is true
  and exists (
    select 1
    from public.lessons lesson
    where lesson.lesson_plan_id = material.lesson_plan_id
      and lesson.curriculum_week_number = material.curriculum_week_number
      and lesson.session_number = material.session_number
  )
  and not exists (
    select 1
    from public.lessons lesson
    where lesson.lesson_plan_id = material.lesson_plan_id
      and lesson.curriculum_week_number = material.curriculum_week_number
      and lesson.session_number = material.session_number
      and lesson.status <> 'draft'
  );

-- Direct inserts of live content predated the update-only locking trigger.
-- Lock those historical live records now, then cover direct live inserts too.
update public.lessons
set content_locked_at = coalesce(content_locked_at, now())
where status <> 'draft'
  and content_locked_at is null;

update public.assignments
set content_locked_at = coalesce(content_locked_at, now())
where is_active is true
  and content_locked_at is null;

create or replace function public.lock_generated_content_on_publish()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from 'draft'
     and (tg_op = 'INSERT' or coalesce(old.status, 'draft') = 'draft')
     and new.content_locked_at is null then
    new.content_locked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lock_lesson_on_insert on public.lessons;
create trigger lock_lesson_on_insert
  before insert on public.lessons
  for each row execute function public.lock_generated_content_on_publish();

create or replace function public.lock_generated_assignment_on_release()
returns trigger language plpgsql as $$
begin
  if new.is_active is true
     and (tg_op = 'INSERT' or coalesce(old.is_active, false) is false)
     and new.content_locked_at is null then
    new.content_locked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lock_assignment_on_insert on public.assignments;
create trigger lock_assignment_on_insert
  before insert on public.assignments
  for each row execute function public.lock_generated_assignment_on_release();

create unique index if not exists lessons_plan_week_session_unique
  on public.lessons (lesson_plan_id, curriculum_week_number, session_number)
  where lesson_plan_id is not null;

create unique index if not exists lesson_materials_plan_week_session_slides_unique
  on public.lesson_materials (lesson_plan_id, curriculum_week_number, session_number)
  where lesson_plan_id is not null and file_type = 'slide-deck';

create unique index if not exists flashcard_decks_plan_week_session_unique
  on public.flashcard_decks (lesson_plan_id, curriculum_week_number, session_number)
  where lesson_plan_id is not null;

create unique index if not exists assignments_plan_week_session_type_unique
  on public.assignments (
    lesson_plan_id,
    curriculum_week_number,
    session_number,
    coalesce(assignment_type, 'assignment')
  )
  where lesson_plan_id is not null;

comment on index public.lessons_plan_week_session_unique is
  'One canonical lesson foundation per lesson plan, curriculum week and class meeting.';

comment on index public.lesson_materials_plan_week_session_slides_unique is
  'One canonical slide deck per lesson plan, curriculum week and class meeting.';
