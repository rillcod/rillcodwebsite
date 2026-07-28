-- School adoptions remain the broad rollout mechanism. Offering directions add
-- the missing precise layer for Virtual School and duration-based cohorts.

create table if not exists public.academic_offering_curriculum_directions (
  id uuid primary key default gen_random_uuid(),
  academic_offering_id uuid not null references public.academic_offerings(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  release_id uuid not null references public.academic_curriculum_releases(id) on delete restrict,
  status text not null default 'active' check(status in ('active','superseded')),
  assigned_by uuid references public.portal_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists offering_curriculum_one_active_direction
  on public.academic_offering_curriculum_directions(academic_offering_id,course_id)
  where status='active';

alter table public.academic_offering_curriculum_directions enable row level security;
create policy offering_curriculum_direction_read on public.academic_offering_curriculum_directions
for select to authenticated using(
  exists(select 1 from public.academic_offerings o where o.id=academic_offering_id)
);
create policy offering_curriculum_direction_admin on public.academic_offering_curriculum_directions
for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.academic_offering_curriculum_directions to authenticated;
grant all on public.academic_offering_curriculum_directions to service_role;

create or replace function public.publish_offering_curriculum_direction(
  p_academic_offering_id uuid,p_course_id uuid,p_release_id uuid,p_actor_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_release_course uuid; v_role text;
begin
  select role into v_role from public.portal_users where id=p_actor_id;
  if v_role<>'admin' then raise exception 'Only the Academic Office can set official curriculum direction.'; end if;
  select course_id into v_release_course from public.academic_curriculum_releases
  where id=p_release_id and status='published';
  if v_release_course is null then raise exception 'Choose a published curriculum edition.'; end if;
  if v_release_course<>p_course_id then raise exception 'The curriculum edition does not belong to this course.'; end if;
  if not exists(select 1 from public.academic_offerings where id=p_academic_offering_id) then
    raise exception 'Academic pathway not found.';
  end if;
  update public.academic_offering_curriculum_directions set status='superseded',updated_at=now()
  where academic_offering_id=p_academic_offering_id and course_id=p_course_id and status='active';
  insert into public.academic_offering_curriculum_directions(
    academic_offering_id,course_id,release_id,assigned_by
  ) values(p_academic_offering_id,p_course_id,p_release_id,p_actor_id) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.attach_official_direction_to_lesson_plan()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_adopted_release uuid; v_release_course uuid; v_actor_role text; v_class_offering uuid;
begin
  if tg_op='UPDATE' and old.curriculum_release_id is not null
    and new.curriculum_release_id is distinct from old.curriculum_release_id then
    if auth.uid() is not null then
      select role into v_actor_role from public.portal_users where id=auth.uid();
      if coalesce(v_actor_role,'')<>'admin' then
        raise exception using message='This lesson plan keeps the academic direction it started with.',
          hint='Create a future plan for the new curriculum edition, or ask the Academic Office for an exceptional change.';
      end if;
    end if;
  end if;

  if new.academic_offering_id is null and new.class_id is not null then
    select academic_offering_id into v_class_offering from public.classes where id=new.class_id;
    new.academic_offering_id:=v_class_offering;
  else v_class_offering:=new.academic_offering_id;
  end if;

  if new.curriculum_release_id is null and v_class_offering is not null and new.course_id is not null then
    select release_id into v_adopted_release
    from public.academic_offering_curriculum_directions
    where academic_offering_id=v_class_offering and course_id=new.course_id and status='active'
    order by assigned_at desc limit 1;
    new.curriculum_release_id:=v_adopted_release;
  end if;
  if new.curriculum_release_id is null and new.school_id is not null and new.course_id is not null then
    select release_id into v_adopted_release from public.academic_curriculum_adoptions
    where school_id=new.school_id and course_id=new.course_id and status='active'
    order by adopted_at desc limit 1;
    new.curriculum_release_id:=v_adopted_release;
  end if;

  if new.curriculum_release_id is not null then
    select course_id into v_release_course from public.academic_curriculum_releases
    where id=new.curriculum_release_id and status='published';
    if v_release_course is null then raise exception 'The selected academic direction is not published.'; end if;
    if new.course_id is not null and v_release_course<>new.course_id then
      raise exception 'The academic direction does not belong to this course.';
    end if;
    if not exists(
      select 1 from public.academic_offering_curriculum_directions d
      where d.academic_offering_id=v_class_offering and d.course_id=v_release_course
        and d.release_id=new.curriculum_release_id and d.status='active'
    ) and not exists(
      select 1 from public.academic_curriculum_adoptions a
      where a.school_id=new.school_id and a.course_id=v_release_course
        and a.release_id=new.curriculum_release_id and a.status='active'
    ) then
      raise exception using message='This curriculum direction is not assigned to the class academic pathway.',
        hint='The Academic Office should assign the official edition once; future lesson plans inherit it automatically.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.publish_offering_curriculum_direction(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_offering_curriculum_direction(uuid,uuid,uuid,uuid) to service_role;

comment on table public.academic_offering_curriculum_directions is
  'One official curriculum edition per course and academic offering. Lesson plans inherit it automatically.';
