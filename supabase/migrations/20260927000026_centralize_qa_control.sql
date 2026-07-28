-- QA configuration is an academic-office responsibility. Teachers may customise
-- delivery activities through proposals, but they must not change the standard,
-- lane, grade mapping, or catalog version from scattered feature screens.

create or replace function public.guard_course_curriculum_qa_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
begin
  if auth.uid() is null then return new; end if;
  select role into v_actor_role from public.portal_users where id = auth.uid();
  if coalesce(v_actor_role, '') <> 'admin'
     and (old.content #> '{metadata,qa_spine}') is distinct from (new.content #> '{metadata,qa_spine}') then
    raise exception using
      errcode = '42501',
      message = 'The academic standard is managed centrally.',
      hint = 'You can customise lesson activities or send an academic change suggestion for review.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_course_curriculum_qa_control on public.course_curricula;
create trigger guard_course_curriculum_qa_control
before update of content on public.course_curricula
for each row execute function public.guard_course_curriculum_qa_control();

create or replace function public.guard_class_qa_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
begin
  if auth.uid() is null then return new; end if;
  select role into v_actor_role from public.portal_users where id = auth.uid();
  if coalesce(v_actor_role, '') <> 'admin' and (
    old.qa_grade_key is distinct from new.qa_grade_key
    or old.qa_grade_mode is distinct from new.qa_grade_mode
    or old.qa_grade_band is distinct from new.qa_grade_band
    or old.qa_track_hint is distinct from new.qa_track_hint
    or old.qa_spine_lane is distinct from new.qa_spine_lane
  ) then
    raise exception using
      errcode = '42501',
      message = 'Class academic alignment is managed by the Academic Office.',
      hint = 'Update ordinary class details here, or send an academic change suggestion for review.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_class_qa_control on public.classes;
create trigger guard_class_qa_control
before update of qa_grade_key, qa_grade_mode, qa_grade_band, qa_track_hint, qa_spine_lane
on public.classes
for each row execute function public.guard_class_qa_control();

comment on function public.guard_course_curriculum_qa_control() is
  'Prevents non-admin users from changing the central QA spine through curriculum delivery screens.';
comment on function public.guard_class_qa_control() is
  'Prevents non-admin users from changing academic alignment through ordinary class settings.';

