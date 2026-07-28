-- Central curriculum drafts belong to the Academic Office. Teachers and school
-- users read their assigned direction and suggest changes through proposals.

drop policy if exists "delete_curricula" on public.course_curricula;
drop policy if exists "insert_curricula" on public.course_curricula;
drop policy if exists "school admins insert curricula for their school" on public.course_curricula;
drop policy if exists "school admins select curricula for their school" on public.course_curricula;
drop policy if exists "school admins update curricula for their school" on public.course_curricula;
drop policy if exists "select_curricula" on public.course_curricula;
drop policy if exists "teachers select curricula for their school" on public.course_curricula;
drop policy if exists "update_curricula" on public.course_curricula;

create policy curriculum_admin_manage
on public.course_curricula for all
using (exists (
  select 1 from public.portal_users actor
  where actor.id = auth.uid() and actor.role = 'admin'
))
with check (exists (
  select 1 from public.portal_users actor
  where actor.id = auth.uid() and actor.role = 'admin'
));

create policy curriculum_school_copy_read
on public.course_curricula for select
using (
  school_id is not null
  and exists (
    select 1 from public.portal_users actor
    where actor.id = auth.uid()
      and (
        (actor.role in ('school', 'school_admin') and actor.school_id = course_curricula.school_id)
        or (
          actor.role = 'teacher'
          and exists (
            select 1 from public.teacher_schools assignment
            where assignment.teacher_id = actor.id
              and assignment.school_id = course_curricula.school_id
          )
        )
      )
  )
);

-- Familiar grade/band labels are ordinary class identity and remain editable;
-- only technical spine mechanics are locked to the Academic Office.
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
  if coalesce(v_actor_role, '') <> 'admin' then
    if tg_op = 'INSERT' then
      if new.qa_grade_mode is not null or new.qa_track_hint is not null or new.qa_spine_lane is not null then
        raise exception using
          errcode = '42501',
          message = 'Academic alignment is applied automatically by the Curriculum Studio.',
          hint = 'Choose the familiar class level only; the Academic Office manages internal alignment.';
      end if;
    elsif old.qa_grade_mode is distinct from new.qa_grade_mode
       or old.qa_track_hint is distinct from new.qa_track_hint
       or old.qa_spine_lane is distinct from new.qa_spine_lane then
      raise exception using
        errcode = '42501',
        message = 'Academic alignment is managed in the Curriculum Studio.',
        hint = 'You may update the familiar class level, or send an academic change suggestion.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_class_qa_control on public.classes;
drop trigger if exists guard_class_qa_control_insert on public.classes;
drop trigger if exists guard_class_qa_control_update on public.classes;

create trigger guard_class_qa_control_insert
before insert on public.classes
for each row execute function public.guard_class_qa_control();

create trigger guard_class_qa_control_update
before update of qa_grade_key, qa_grade_mode, qa_grade_band, qa_track_hint, qa_spine_lane
on public.classes
for each row execute function public.guard_class_qa_control();
