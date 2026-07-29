-- A Special or In-person programme runs on a delivery period — "Summer
-- Bootcamp, 8 July to 16 August" — not on First/Second/Third Term. The schema
-- already carries offering_period_id on classes and lesson_plans, but the
-- teaching plan could only be created from an academic term, so a bootcamp
-- class could not start a plan at all.
--
-- One function now serves both, keyed on whichever the class actually uses.
-- ensure_class_term_teaching_plan is replaced rather than duplicated, so there
-- is a single way to create a plan.

-- Period-keyed plans need their own uniqueness; the existing index only covers
-- rows with a term.
create unique index if not exists lesson_plans_active_class_period_course_unique
  on public.lesson_plans(class_id, offering_period_id, course_id)
  where class_id is not null and offering_period_id is not null
    and course_id is not null and status <> 'archived';

drop function if exists public.ensure_class_term_teaching_plan(uuid, uuid, uuid, uuid, uuid, integer);

create or replace function public.ensure_class_teaching_plan(
  p_class_id uuid,
  p_course_id uuid,
  p_curriculum_version_id uuid,
  p_actor_id uuid,
  p_academic_term_id uuid default null,
  p_offering_period_id uuid default null,
  p_sessions_per_week integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_class public.classes%rowtype;
  v_term public.academic_terms%rowtype;
  v_period public.academic_offering_periods%rowtype;
  v_curr public.course_curricula%rowtype;
  v_plan public.lesson_plans%rowtype;
  v_plan_data jsonb := '{}'::jsonb;
  v_created boolean := false;
  v_term_label text;
  v_starts date;
  v_ends date;
  v_lock_key text;
begin
  if p_class_id is null or p_course_id is null then
    raise exception 'class_id and course_id are required';
  end if;

  if not public.actor_may_manage_class(p_class_id, p_actor_id) then
    raise exception 'You may not create a teaching plan for this class';
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then raise exception 'Class not found'; end if;

  -- Fall back to whatever the class itself is scheduled by.
  p_academic_term_id := coalesce(p_academic_term_id, v_class.term_id);
  p_offering_period_id := coalesce(p_offering_period_id, v_class.offering_period_id);

  if p_academic_term_id is null and p_offering_period_id is null then
    raise exception using
      message='This class has neither an academic term nor a delivery period.',
      hint='Give the class a term for school pathways, or a delivery period for bootcamps and short courses.';
  end if;

  if not exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and (v_class.program_id is null or c.program_id = v_class.program_id)
  ) then
    raise exception 'Course does not belong to the class programme';
  end if;

  if p_academic_term_id is not null then
    if v_class.term_id is distinct from p_academic_term_id then
      raise exception 'Academic term does not match class term';
    end if;
    select * into v_term from public.academic_terms where id = p_academic_term_id;
    if not found then raise exception 'Academic term not found'; end if;
    v_term_label := v_term.term_label || ' ' || v_term.academic_year;
    v_starts := v_term.start_date;
    v_ends := v_term.end_date;
    v_lock_key := p_class_id::text || ':' || p_academic_term_id::text || ':' || p_course_id::text;
  else
    if v_class.offering_period_id is distinct from p_offering_period_id then
      raise exception 'Delivery period does not match the class delivery period';
    end if;
    select * into v_period from public.academic_offering_periods where id = p_offering_period_id;
    if not found then raise exception 'Delivery period not found'; end if;
    v_term_label := v_period.label;
    v_starts := v_period.starts_on;
    v_ends := v_period.ends_on;
    v_lock_key := p_class_id::text || ':period:' || p_offering_period_id::text || ':' || p_course_id::text;
  end if;

  if p_curriculum_version_id is not null then
    select * into v_curr from public.course_curricula where id = p_curriculum_version_id;
    if not found or v_curr.course_id is distinct from p_course_id then
      raise exception 'Curriculum does not belong to the selected course';
    end if;
    if v_curr.school_id is not null and v_curr.school_id is distinct from v_class.school_id then
      raise exception 'Curriculum belongs to a different school';
    end if;
    v_plan_data := jsonb_build_object('curriculum_year', 1);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  if p_academic_term_id is not null then
    select * into v_plan from public.lesson_plans
    where class_id = p_class_id and term_id = p_academic_term_id
      and course_id = p_course_id and status <> 'archived'
    limit 1 for update;
  else
    select * into v_plan from public.lesson_plans
    where class_id = p_class_id and offering_period_id = p_offering_period_id
      and course_id = p_course_id and status <> 'archived'
    limit 1 for update;
  end if;

  if found then
    if p_curriculum_version_id is not null
      and v_plan.curriculum_version_id is distinct from p_curriculum_version_id then
      update public.lesson_plans
      set curriculum_version_id = p_curriculum_version_id, version = version + 1, updated_at = now()
      where id = v_plan.id returning * into v_plan;
    end if;
  else
    insert into public.lesson_plans(
      class_id, school_id, course_id, term_id, offering_period_id, term, term_start, term_end,
      sessions_per_week, curriculum_version_id, plan_data, status, version, created_by, created_at, updated_at
    ) values (
      p_class_id, v_class.school_id, p_course_id, p_academic_term_id, p_offering_period_id,
      v_term_label, v_starts, v_ends,
      greatest(coalesce(p_sessions_per_week, 1), 1), p_curriculum_version_id, v_plan_data,
      'draft', 1, p_actor_id, now(), now()
    ) returning * into v_plan;
    v_created := true;
  end if;

  return jsonb_build_object('plan_id', v_plan.id, 'created', v_created,
    'curriculum_version_id', v_plan.curriculum_version_id,
    'scheduled_by', case when p_academic_term_id is not null then 'academic_term' else 'delivery_period' end);
end $function$;

revoke execute on function public.ensure_class_teaching_plan(uuid, uuid, uuid, uuid, uuid, uuid, integer)
  from anon, authenticated;

comment on function public.ensure_class_teaching_plan(uuid, uuid, uuid, uuid, uuid, uuid, integer) is
  'Service-role only. Creates the one teaching plan for a class and course, keyed on the academic term for school pathways or the delivery period for bootcamps and short courses.';

-- The official-direction guard only fired for plans carrying a term, so a
-- period-based plan could be created with no protected edition behind it.
create or replace function public.attach_official_direction_to_lesson_plan()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_release_id uuid;
  v_release_course uuid;
  v_source_curriculum uuid;
  v_actor_role text;
  v_class_offering uuid;
  v_offering_type text;
  v_academic_session text;
  v_term_number integer;
  v_assigned boolean:=false;
begin
  if new.class_id is not null then
    select c.academic_offering_id,o.enrollment_type,t.academic_year,t.term_number
      into v_class_offering,v_offering_type,v_academic_session,v_term_number
    from public.classes c
    left join public.academic_offerings o on o.id=c.academic_offering_id
    left join public.academic_terms t on t.id=coalesce(new.term_id,c.term_id)
    where c.id=new.class_id;
    new.academic_offering_id:=coalesce(new.academic_offering_id,v_class_offering);
  else
    v_class_offering:=new.academic_offering_id;
    if v_class_offering is not null then
      select enrollment_type into v_offering_type
      from public.academic_offerings where id=v_class_offering;
    end if;
  end if;

  if tg_op='UPDATE' and old.curriculum_release_id is not null
    and new.curriculum_release_id is distinct from old.curriculum_release_id then
    select role into v_actor_role from public.portal_users where id=auth.uid();
    if coalesce(v_actor_role,'')<>'admin' then
      raise exception using
        message='This teaching plan keeps the official direction it started with.',
        hint='Create the future term plan from the new direction instead of rewriting this record.';
    end if;
  end if;

  v_release_id:=new.curriculum_release_id;
  if v_release_id is null and coalesce(v_offering_type,'school')='school'
    and new.school_id is not null and new.course_id is not null then
    select release_id into v_release_id
    from public.academic_curriculum_adoptions
    where school_id=new.school_id and course_id=new.course_id and status='active'
      and (v_academic_session is null or academic_session=v_academic_session)
      and (v_term_number is null or effective_term_number<=v_term_number)
    order by effective_term_number desc,adopted_at desc limit 1;
  end if;
  if v_release_id is null and v_class_offering is not null and new.course_id is not null then
    select release_id into v_release_id
    from public.academic_offering_curriculum_directions
    where academic_offering_id=v_class_offering and course_id=new.course_id and status='active'
    order by assigned_at desc limit 1;
  end if;

  if v_release_id is not null then
    if tg_op='UPDATE' then
      v_assigned:=old.curriculum_release_id=v_release_id;
    end if;
    if not v_assigned and v_class_offering is not null then
      select exists(select 1 from public.academic_offering_curriculum_directions d
        where d.academic_offering_id=v_class_offering and d.course_id=new.course_id
          and d.release_id=v_release_id and d.status='active') into v_assigned;
    end if;
    if not v_assigned and coalesce(v_offering_type,'school')='school' and new.school_id is not null then
      select exists(select 1 from public.academic_curriculum_adoptions a
        where a.school_id=new.school_id and a.course_id=new.course_id
          and a.release_id=v_release_id and a.status='active'
          and (v_academic_session is null or a.academic_session=v_academic_session)) into v_assigned;
    end if;
    if not v_assigned then
      raise exception using
        message='This official direction is not assigned to the class academic pathway.',
        hint='Assign the direction in the Academic Office; the teaching plan will inherit it automatically.';
    end if;
    select course_id,source_curriculum_id into v_release_course,v_source_curriculum
    from public.academic_curriculum_releases
    where id=v_release_id and status='published';
    if v_release_course is null then raise exception 'The selected academic direction is not published.'; end if;
    if new.course_id is not null and v_release_course<>new.course_id then
      raise exception 'The official direction belongs to a different course.';
    end if;
    new.curriculum_release_id:=v_release_id;
    new.curriculum_version_id:=v_source_curriculum;
  elsif new.class_id is not null and new.course_id is not null
    and (new.term_id is not null or new.offering_period_id is not null) then
    raise exception using
      message='No official curriculum direction is assigned to this class and course.',
      hint='Publish and assign the direction in the Academic Office before starting the term plan.';
  end if;
  return new;
end;
$$;

drop trigger if exists attach_official_direction_to_lesson_plan on public.lesson_plans;
create trigger attach_official_direction_to_lesson_plan
before insert or update of class_id,school_id,course_id,term_id,offering_period_id,academic_offering_id,curriculum_release_id,curriculum_version_id
on public.lesson_plans for each row execute function public.attach_official_direction_to_lesson_plan();
