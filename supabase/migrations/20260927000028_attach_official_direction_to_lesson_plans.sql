-- Lesson plans silently inherit the official edition adopted by their school.
-- Once attached, an active plan keeps that edition even when a newer edition is
-- assigned, preventing curriculum bleed and mid-term disruption.

create or replace function public.attach_official_direction_to_lesson_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adopted_release uuid;
  v_release_course uuid;
  v_actor_role text;
begin
  if tg_op = 'UPDATE'
     and old.curriculum_release_id is not null
     and new.curriculum_release_id is distinct from old.curriculum_release_id then
    if auth.uid() is not null then
      select role into v_actor_role from public.portal_users where id = auth.uid();
      if coalesce(v_actor_role, '') <> 'admin' then
        raise exception using
          errcode = '42501',
          message = 'This lesson plan keeps the academic direction it started with.',
          hint = 'Create a future plan for the new curriculum edition, or ask the Academic Office for an exceptional change.';
      end if;
    end if;
  end if;

  if new.curriculum_release_id is null and new.school_id is not null and new.course_id is not null then
    select release_id into v_adopted_release
    from public.academic_curriculum_adoptions
    where school_id = new.school_id
      and course_id = new.course_id
      and status = 'active'
    order by adopted_at desc
    limit 1;
    new.curriculum_release_id := v_adopted_release;
  end if;

  if new.curriculum_release_id is not null then
    select course_id into v_release_course
    from public.academic_curriculum_releases
    where id = new.curriculum_release_id and status = 'published';
    if v_release_course is null then
      raise exception using
        errcode = '23503',
        message = 'The selected academic direction is not published.';
    end if;
    if new.course_id is not null and v_release_course <> new.course_id then
      raise exception using
        errcode = '23514',
        message = 'The academic direction does not belong to this course.';
    end if;
    if new.school_id is not null and not exists (
      select 1 from public.academic_curriculum_adoptions
      where school_id = new.school_id
        and course_id = v_release_course
        and release_id = new.curriculum_release_id
        and status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'This academic direction is not assigned to the lesson plan’s school.',
        hint = 'Assign the official direction to the school before creating its future lesson plan.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists attach_official_direction_to_lesson_plan on public.lesson_plans;
create trigger attach_official_direction_to_lesson_plan
before insert or update of school_id, course_id, curriculum_release_id
on public.lesson_plans
for each row execute function public.attach_official_direction_to_lesson_plan();

comment on function public.attach_official_direction_to_lesson_plan() is
  'Snapshots a school active official curriculum edition onto each future lesson plan and prevents accidental cross-school or mid-plan drift.';

