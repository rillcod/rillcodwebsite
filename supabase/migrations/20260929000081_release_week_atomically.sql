-- A week is learner-visible only when all held package rows cross the release
-- gate together. Sequential application updates could expose a lesson while
-- its assignment or flashcards remained hidden after a later failure.

create or replace function public.release_prepared_week_atomic(
  p_lesson_plan_id uuid,
  p_week_number integer,
  p_session_number integer default null,
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
  v_flashcards integer := 0;
  v_assignment_ids uuid[] := '{}';
begin
  if p_week_number not between 1 and 53 then
    raise exception 'Week number must be between 1 and 53';
  end if;
  if p_session_number is not null
     and p_session_number not between 1 and 20 then
    raise exception 'Session number must be between 1 and 20';
  end if;
  if not exists (
    select 1
    from public.lesson_plans
    where id = p_lesson_plan_id and status <> 'archived'
  ) then
    raise exception 'Teaching plan not found';
  end if;

  update public.lessons
  set status = 'active', updated_at = p_released_at
  where lesson_plan_id = p_lesson_plan_id
    and curriculum_week_number = p_week_number
    and status = 'draft'
    and (
      p_session_number is null
      or session_number = p_session_number
    );
  get diagnostics v_lessons = row_count;

  with activated as (
    update public.assignments
    set is_active = true, updated_at = p_released_at
    where lesson_plan_id = p_lesson_plan_id
      and curriculum_week_number = p_week_number
      and is_active = false
      and (
        p_session_number is null
        or session_number = p_session_number
      )
    returning id
  )
  select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
  into v_assignments, v_assignment_ids
  from activated;

  update public.flashcard_decks
  set is_public = true, updated_at = p_released_at
  where lesson_plan_id = p_lesson_plan_id
    and curriculum_week_number = p_week_number
    and is_public = false
    and (
      p_session_number is null
      or session_number = p_session_number
    );
  get diagnostics v_flashcards = row_count;

  return jsonb_build_object(
    'lessons_released', v_lessons,
    'assignments_released', v_assignments,
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
  'Service-role release gate for one plan/week/session. Lessons, assignments, projects and flashcards become visible in one transaction.';
