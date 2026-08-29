-- A teaching package is one learner-facing unit. Older code could make a
-- single slide or assignment public while the rest of its meeting stayed held.
-- First close those partial releases, then make the atomic release RPC reject
-- any package that does not contain all five core learning items.
-- Submissions, scores, attendance and delivery evidence are intentionally not
-- touched by this migration.

create temporary table partial_teaching_package_slots on commit drop as
with slots as (
  select lesson_plan_id, curriculum_week_number as week_number,
         coalesce(session_number, 1) as session_number
  from public.lessons
  where lesson_plan_id is not null and curriculum_week_number is not null
  union
  select lesson_plan_id, curriculum_week_number, coalesce(session_number, 1)
  from public.assignments
  where lesson_plan_id is not null and curriculum_week_number is not null
  union
  select lesson_plan_id, curriculum_week_number, coalesce(session_number, 1)
  from public.lesson_materials
  where lesson_plan_id is not null and curriculum_week_number is not null
    and file_type = 'slide-deck'
  union
  select lesson_plan_id, curriculum_week_number, coalesce(session_number, 1)
  from public.flashcard_decks
  where lesson_plan_id is not null and curriculum_week_number is not null
), state as (
  select s.*,
    exists (
      select 1 from public.lessons l
      where l.lesson_plan_id = s.lesson_plan_id
        and l.curriculum_week_number = s.week_number
        and coalesce(l.session_number, 1) = s.session_number
        and l.status <> 'draft'
    ) as lesson_live,
    exists (
      select 1 from public.lesson_materials m
      where m.lesson_plan_id = s.lesson_plan_id
        and m.curriculum_week_number = s.week_number
        and coalesce(m.session_number, 1) = s.session_number
        and m.file_type = 'slide-deck' and m.is_public = true
    ) as slides_live,
    exists (
      select 1 from public.flashcard_decks f
      where f.lesson_plan_id = s.lesson_plan_id
        and f.curriculum_week_number = s.week_number
        and coalesce(f.session_number, 1) = s.session_number
        and f.is_public = true
    ) as cards_live,
    exists (
      select 1 from public.assignments a
      where a.lesson_plan_id = s.lesson_plan_id
        and a.curriculum_week_number = s.week_number
        and coalesce(a.session_number, 1) = s.session_number
        and lower(coalesce(a.assignment_type, 'assignment')) <> 'project'
        and a.is_active = true
    ) as assignment_live,
    exists (
      select 1 from public.assignments a
      where a.lesson_plan_id = s.lesson_plan_id
        and a.curriculum_week_number = s.week_number
        and coalesce(a.session_number, 1) = s.session_number
        and lower(coalesce(a.assignment_type, '')) = 'project'
        and a.is_active = true
    ) as project_live
  from slots s
)
select lesson_plan_id, week_number, session_number
from state
where (lesson_live or slides_live or cards_live or assignment_live or project_live)
  and not (lesson_live and slides_live and cards_live and assignment_live and project_live);

update public.lessons l
set status = 'draft', updated_at = now()
from partial_teaching_package_slots p
where l.lesson_plan_id = p.lesson_plan_id
  and l.curriculum_week_number = p.week_number
  and coalesce(l.session_number, 1) = p.session_number
  and l.status <> 'draft';

update public.assignments a
set is_active = false, updated_at = now()
from partial_teaching_package_slots p
where a.lesson_plan_id = p.lesson_plan_id
  and a.curriculum_week_number = p.week_number
  and coalesce(a.session_number, 1) = p.session_number
  and a.is_active = true;

update public.lesson_materials m
set is_public = false
from partial_teaching_package_slots p
where m.lesson_plan_id = p.lesson_plan_id
  and m.curriculum_week_number = p.week_number
  and coalesce(m.session_number, 1) = p.session_number
  and m.file_type = 'slide-deck'
  and m.is_public = true;

update public.flashcard_decks f
set is_public = false, updated_at = now()
from partial_teaching_package_slots p
where f.lesson_plan_id = p.lesson_plan_id
  and f.curriculum_week_number = p.week_number
  and coalesce(f.session_number, 1) = p.session_number
  and f.is_public = true;

create or replace function public.release_prepared_week_atomic(
  p_lesson_plan_id uuid,
  p_week_number integer,
  p_session_number integer,
  p_released_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lessons integer := 0;
  v_assignments integer := 0;
  v_slides integer := 0;
  v_flashcards integer := 0;
  v_assignment_ids uuid[] := '{}';
  v_missing text[] := '{}';
begin
  if p_week_number not between 1 and 53 then
    raise exception 'Week number must be between 1 and 53';
  end if;
  if p_session_number not between 1 and 20 then
    raise exception 'Session number must be between 1 and 20';
  end if;
  if not exists (
    select 1 from public.lesson_plans
    where id = p_lesson_plan_id and status <> 'archived'
  ) then
    raise exception 'Teaching plan not found';
  end if;

  if not exists (
    select 1 from public.lessons
    where lesson_plan_id = p_lesson_plan_id
      and curriculum_week_number = p_week_number
      and coalesce(session_number, 1) = p_session_number
  ) then v_missing := array_append(v_missing, 'lesson'); end if;
  if not exists (
    select 1 from public.lesson_materials
    where lesson_plan_id = p_lesson_plan_id
      and curriculum_week_number = p_week_number
      and coalesce(session_number, 1) = p_session_number
      and file_type = 'slide-deck'
  ) then v_missing := array_append(v_missing, 'slides'); end if;
  if not exists (
    select 1 from public.flashcard_decks
    where lesson_plan_id = p_lesson_plan_id
      and curriculum_week_number = p_week_number
      and coalesce(session_number, 1) = p_session_number
  ) then v_missing := array_append(v_missing, 'practice cards'); end if;
  if not exists (
    select 1 from public.assignments
    where lesson_plan_id = p_lesson_plan_id
      and curriculum_week_number = p_week_number
      and coalesce(session_number, 1) = p_session_number
      and lower(coalesce(assignment_type, 'assignment')) <> 'project'
  ) then v_missing := array_append(v_missing, 'assignment'); end if;
  if not exists (
    select 1 from public.assignments
    where lesson_plan_id = p_lesson_plan_id
      and curriculum_week_number = p_week_number
      and coalesce(session_number, 1) = p_session_number
      and lower(coalesce(assignment_type, '')) = 'project'
  ) then v_missing := array_append(v_missing, 'project'); end if;

  if cardinality(v_missing) > 0 then
    raise exception 'Complete this teaching package before sharing it. Missing: %',
      array_to_string(v_missing, ', ');
  end if;

  update public.lessons
  set status = 'active', updated_at = p_released_at
  where lesson_plan_id = p_lesson_plan_id
    and curriculum_week_number = p_week_number
    and coalesce(session_number, 1) = p_session_number
    and status = 'draft';
  get diagnostics v_lessons = row_count;

  with activated as (
    update public.assignments
    set is_active = true, updated_at = p_released_at
    where lesson_plan_id = p_lesson_plan_id
      and curriculum_week_number = p_week_number
      and coalesce(session_number, 1) = p_session_number
      and is_active = false
    returning id
  )
  select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
  into v_assignments, v_assignment_ids
  from activated;

  update public.lesson_materials
  set is_public = true
  where lesson_plan_id = p_lesson_plan_id
    and curriculum_week_number = p_week_number
    and coalesce(session_number, 1) = p_session_number
    and file_type = 'slide-deck'
    and is_public = false;
  get diagnostics v_slides = row_count;

  update public.flashcard_decks
  set is_public = true, updated_at = p_released_at
  where lesson_plan_id = p_lesson_plan_id
    and curriculum_week_number = p_week_number
    and coalesce(session_number, 1) = p_session_number
    and is_public = false;
  get diagnostics v_flashcards = row_count;

  return jsonb_build_object(
    'lessons_released', v_lessons,
    'assignments_released', v_assignments,
    'slides_released', v_slides,
    'flashcards_released', v_flashcards,
    'assignment_ids', to_jsonb(v_assignment_ids)
  );
end
$function$;

revoke execute on function public.release_prepared_week_atomic(
  uuid, integer, integer, timestamptz
) from public, anon, authenticated;

grant execute on function public.release_prepared_week_atomic(
  uuid, integer, integer, timestamptz
) to service_role;

comment on function public.release_prepared_week_atomic(
  uuid, integer, integer, timestamptz
) is
  'Service-role gate for one complete five-item teaching package. Partial packages cannot become learner-visible.';
