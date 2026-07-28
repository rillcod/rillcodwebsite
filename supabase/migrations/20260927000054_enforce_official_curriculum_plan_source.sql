-- Make the protected release, not the mutable Studio draft, authoritative for
-- every class-term teaching plan. Legacy per-lesson notes remain supported.

alter table public.academic_curriculum_releases
  drop constraint if exists academic_curriculum_releases_course_id_content_hash_key;
create unique index if not exists academic_curriculum_release_context_hash_uq
  on public.academic_curriculum_releases(
    course_id,academic_session,effective_term_number,coalesce(grade_key,''),content_hash
  );

alter table public.academic_curriculum_adoptions
  drop constraint if exists academic_curriculum_adoptions_school_id_course_id_key,
  add column if not exists effective_term_number integer;

update public.academic_curriculum_adoptions a
set effective_term_number=r.effective_term_number
from public.academic_curriculum_releases r
where r.id=a.release_id and a.effective_term_number is null;

alter table public.academic_curriculum_adoptions
  alter column effective_term_number set not null,
  add constraint academic_curriculum_adoptions_effective_term_check
    check(effective_term_number between 1 and 3);

create or replace function public.sync_academic_curriculum_adoption_context()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_release public.academic_curriculum_releases%rowtype;
begin
  select * into v_release from public.academic_curriculum_releases where id=new.release_id;
  if not found then raise exception 'Official curriculum edition not found'; end if;
  if v_release.course_id is distinct from new.course_id then
    raise exception 'Official curriculum edition belongs to a different course';
  end if;
  new.academic_session:=v_release.academic_session;
  new.effective_term_number:=v_release.effective_term_number;
  select at.id into new.effective_academic_term_id
  from public.academic_terms at
  where at.academic_year=v_release.academic_session
    and at.term_number=v_release.effective_term_number
  order by at.is_current desc,at.created_at desc limit 1;
  return new;
end;
$$;

drop index if exists public.academic_curriculum_adoption_session_uq;
drop index if exists public.academic_curriculum_adoptions_school_id_course_id_key;
create unique index academic_curriculum_adoption_session_term_uq
  on public.academic_curriculum_adoptions(
    school_id,course_id,academic_session,effective_term_number
  ) nulls not distinct;

update public.lesson_plans lp
set curriculum_release_id=d.release_id,
    curriculum_version_id=r.source_curriculum_id,
    updated_at=now()
from public.classes c
join public.academic_offering_curriculum_directions d
  on d.academic_offering_id=c.academic_offering_id and d.status='active'
join public.academic_curriculum_releases r on r.id=d.release_id
where lp.class_id=c.id and lp.course_id=d.course_id
  and lp.term_id is not null and lp.curriculum_release_id is null;

update public.lesson_plans lp
set curriculum_release_id=a.release_id,
    curriculum_version_id=r.source_curriculum_id,
    updated_at=now()
from public.academic_curriculum_adoptions a
join public.academic_curriculum_releases r on r.id=a.release_id
where lp.school_id=a.school_id and lp.course_id=a.course_id
  and lp.term_id is not null and lp.curriculum_release_id is null
  and not exists(
    select 1 from public.classes c
    join public.academic_offerings o on o.id=c.academic_offering_id
    where c.id=lp.class_id and o.enrollment_type<>'school'
  );

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
  elsif new.class_id is not null and new.course_id is not null and new.term_id is not null then
    raise exception using
      message='No official curriculum direction is assigned to this class and course.',
      hint='Publish and assign the direction in the Academic Office before starting the term plan.';
  end if;
  return new;
end;
$$;

drop trigger if exists attach_official_direction_to_lesson_plan on public.lesson_plans;
create trigger attach_official_direction_to_lesson_plan
before insert or update of class_id,school_id,course_id,term_id,academic_offering_id,curriculum_release_id,curriculum_version_id
on public.lesson_plans for each row execute function public.attach_official_direction_to_lesson_plan();

create or replace view public.academic_lesson_plan_source_issues
with (security_invoker=true) as
select lp.id as lesson_plan_id,lp.class_id,lp.school_id,lp.course_id,lp.term_id,
  lp.curriculum_release_id,lp.curriculum_version_id,
  case
    when lp.curriculum_release_id is null then 'Teaching plan has no protected official direction.'
    when r.id is null then 'Teaching plan points to a missing official direction.'
    when r.course_id is distinct from lp.course_id then 'Teaching plan and official direction belong to different courses.'
    when lp.curriculum_version_id is distinct from r.source_curriculum_id then 'Draft pointer does not match the protected direction source.'
  end as issue
from public.lesson_plans lp
left join public.academic_curriculum_releases r on r.id=lp.curriculum_release_id
where lp.class_id is not null and lp.course_id is not null and lp.term_id is not null
  and (lp.curriculum_release_id is null or r.id is null
    or r.course_id is distinct from lp.course_id
    or lp.curriculum_version_id is distinct from r.source_curriculum_id);

revoke all on public.academic_lesson_plan_source_issues from anon,authenticated;
grant select on public.academic_lesson_plan_source_issues to service_role;

comment on view public.academic_lesson_plan_source_issues is
  'Academic Office repair queue for class-term plans not fused to one protected curriculum release.';
