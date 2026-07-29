-- Projects and learning slides are teaching resources, not parallel academic
-- systems. Keep their existing storage, but bind every class instance to the
-- same offering -> period -> plan -> lesson lineage used by delivery and results.

alter table public.assignments
  add column if not exists project_template_id uuid
  references public.curriculum_project_registry(id) on delete set null;

update public.assignments a
set project_template_id = r.id
from public.curriculum_project_registry r
where a.assignment_type = 'project'
  and a.project_template_id is null
  and r.id = case
    when coalesce(a.metadata->>'project_template_id', a.metadata->>'registry_project_id')
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then coalesce(a.metadata->>'project_template_id', a.metadata->>'registry_project_id')::uuid
  end;

create index if not exists idx_assignments_project_template
  on public.assignments(project_template_id)
  where project_template_id is not null;

create index if not exists idx_assignments_plan_project_week
  on public.assignments(lesson_plan_id, curriculum_week_number)
  where assignment_type = 'project';

alter table public.lesson_materials
  add column if not exists lesson_plan_id uuid references public.lesson_plans(id) on delete set null,
  add column if not exists curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete set null,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists curriculum_week_number integer,
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete set null,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete set null;

do $$ begin
  alter table public.lesson_materials
    add constraint lesson_materials_curriculum_week_number_check
    check (curriculum_week_number is null or curriculum_week_number between 1 and 53);
exception when duplicate_object then null;
end $$;

create or replace function public.bind_lesson_material_to_academic_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx record;
begin
  if new.lesson_id is null then
    return new;
  end if;

  select
    l.lesson_plan_id,
    l.class_id,
    l.curriculum_week_number,
    p.curriculum_release_id,
    p.academic_offering_id,
    p.offering_period_id
  into ctx
  from public.lessons l
  left join public.lesson_plans p on p.id = l.lesson_plan_id
  where l.id = new.lesson_id;

  if not found then
    raise exception 'Lesson not found for learning material.';
  end if;

  new.lesson_plan_id := ctx.lesson_plan_id;
  new.class_id := ctx.class_id;
  new.curriculum_week_number := ctx.curriculum_week_number;
  new.curriculum_release_id := ctx.curriculum_release_id;
  new.academic_offering_id := ctx.academic_offering_id;
  new.offering_period_id := ctx.offering_period_id;
  return new;
end;
$$;

drop trigger if exists bind_lesson_material_academic_context on public.lesson_materials;
create trigger bind_lesson_material_academic_context
before insert or update of lesson_id on public.lesson_materials
for each row execute function public.bind_lesson_material_to_academic_context();

update public.lesson_materials m
set lesson_plan_id = l.lesson_plan_id,
    class_id = l.class_id,
    curriculum_week_number = l.curriculum_week_number,
    curriculum_release_id = p.curriculum_release_id,
    academic_offering_id = p.academic_offering_id,
    offering_period_id = p.offering_period_id
from public.lessons l
left join public.lesson_plans p on p.id = l.lesson_plan_id
where m.lesson_id = l.id;

create index if not exists idx_lesson_materials_plan_week
  on public.lesson_materials(lesson_plan_id, curriculum_week_number)
  where lesson_plan_id is not null;
create index if not exists idx_lesson_materials_class
  on public.lesson_materials(class_id)
  where class_id is not null;
create index if not exists idx_lesson_materials_offering_period
  on public.lesson_materials(academic_offering_id, offering_period_id)
  where academic_offering_id is not null;

comment on column public.assignments.project_template_id is
  'Optional reusable Project Library definition used to create this class project.';
comment on column public.lesson_materials.lesson_plan_id is
  'Canonical teaching plan inherited from the material lesson.';
comment on function public.bind_lesson_material_to_academic_context() is
  'Keeps learning resources on the same offering, period, class and plan spine as their lesson.';
