-- Close legacy cross-tenant tracking policies and bind each delivery record to
-- the class plan (and therefore the protected official curriculum edition).

alter table public.curriculum_week_tracking
  add column if not exists curriculum_release_id uuid
    references public.academic_curriculum_releases(id) on delete restrict;

do $$ begin
  alter table public.curriculum_week_tracking
    add constraint curriculum_week_tracking_curriculum_fkey
    foreign key (curriculum_id) references public.course_curricula(id) on delete cascade not valid;
exception when duplicate_object then null;
end $$;

update public.curriculum_week_tracking tracking
set curriculum_release_id = plans.curriculum_release_id
from public.lesson_plans plans
where tracking.lesson_plan_id = plans.id
  and tracking.curriculum_release_id is null
  and plans.curriculum_release_id is not null;

create or replace function public.bind_curriculum_tracking_to_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.lesson_plans%rowtype;
begin
  if new.lesson_plan_id is null or new.class_id is null or new.school_id is null then
    raise exception using
      errcode = '23514',
      message = 'Delivery progress must belong to a class lesson plan.',
      hint = 'Open the class teaching workspace and record progress there.';
  end if;

  select * into v_plan from public.lesson_plans where id = new.lesson_plan_id;
  if v_plan.id is null then
    raise exception using errcode = '23503', message = 'The lesson plan was not found.';
  end if;
  if v_plan.class_id is distinct from new.class_id or v_plan.school_id is distinct from new.school_id then
    raise exception using
      errcode = '23514',
      message = 'The delivery record does not belong to this class and school.';
  end if;
  if v_plan.curriculum_version_id is null or v_plan.curriculum_version_id <> new.curriculum_id then
    raise exception using
      errcode = '23514',
      message = 'The delivery record does not match the lesson plan curriculum.';
  end if;
  new.curriculum_release_id := v_plan.curriculum_release_id;
  return new;
end;
$$;

drop trigger if exists bind_curriculum_tracking_to_plan on public.curriculum_week_tracking;
create trigger bind_curriculum_tracking_to_plan
before insert or update of curriculum_id, school_id, class_id, lesson_plan_id, curriculum_release_id
on public.curriculum_week_tracking
for each row execute function public.bind_curriculum_tracking_to_plan();

drop policy if exists "Staff can insert tracking" on public.curriculum_week_tracking;
drop policy if exists "Staff can read tracking" on public.curriculum_week_tracking;
drop policy if exists "Staff can update tracking" on public.curriculum_week_tracking;

create policy curriculum_tracking_scoped_read
on public.curriculum_week_tracking for select
using (
  exists (
    select 1 from public.portal_users actor
    where actor.id = auth.uid()
      and (
        actor.role = 'admin'
        or (actor.role = 'school' and actor.school_id = curriculum_week_tracking.school_id)
        or (
          actor.role = 'teacher'
          and exists (
            select 1 from public.teacher_schools assignment
            where assignment.teacher_id = actor.id
              and assignment.school_id = curriculum_week_tracking.school_id
          )
        )
      )
  )
);

create policy curriculum_tracking_scoped_insert
on public.curriculum_week_tracking for insert
with check (
  school_id is not null
  and class_id is not null
  and lesson_plan_id is not null
  and exists (
    select 1 from public.portal_users actor
    where actor.id = auth.uid()
      and (
        actor.role = 'admin'
        or (
          actor.role = 'teacher'
          and exists (
            select 1
            from public.classes class_scope
            join public.teacher_schools assignment
              on assignment.school_id = class_scope.school_id
             and assignment.teacher_id = actor.id
            where class_scope.id = curriculum_week_tracking.class_id
              and class_scope.teacher_id = actor.id
              and class_scope.school_id = curriculum_week_tracking.school_id
          )
        )
      )
  )
);

create policy curriculum_tracking_scoped_update
on public.curriculum_week_tracking for update
using (
  exists (
    select 1 from public.portal_users actor
    where actor.id = auth.uid()
      and (
        actor.role = 'admin'
        or (
          actor.role = 'teacher'
          and exists (
            select 1 from public.classes class_scope
            where class_scope.id = curriculum_week_tracking.class_id
              and class_scope.teacher_id = actor.id
              and class_scope.school_id = curriculum_week_tracking.school_id
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.portal_users actor
    where actor.id = auth.uid()
      and (
        actor.role = 'admin'
        or (
          actor.role = 'teacher'
          and exists (
            select 1 from public.classes class_scope
            where class_scope.id = curriculum_week_tracking.class_id
              and class_scope.teacher_id = actor.id
              and class_scope.school_id = curriculum_week_tracking.school_id
          )
        )
      )
  )
);

create index if not exists curriculum_week_tracking_release_idx
  on public.curriculum_week_tracking(curriculum_release_id, school_id, class_id, term_number, week_number);

comment on column public.curriculum_week_tracking.curriculum_release_id is
  'Official curriculum edition inherited from the lesson plan; protects delivery evidence from later curriculum changes.';

