-- Learner-path visibility is per-class/per-student workflow state, not a
-- platform configuration key. Keeping it in app_settings polluted the admin
-- settings screen and made an operational record look like global policy.

create table if not exists public.progression_path_visibility (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.portal_users(id) on delete cascade,
  mode text not null default 'full' check (mode in ('full', 'milestone')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.portal_users(id) on delete set null,
  constraint progression_path_visibility_one_scope check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  ),
  constraint progression_path_visibility_scope_unique
    unique nulls not distinct (class_id, student_id)
);

create index if not exists idx_progression_path_visibility_class
  on public.progression_path_visibility(class_id)
  where class_id is not null;
create index if not exists idx_progression_path_visibility_student
  on public.progression_path_visibility(student_id)
  where student_id is not null;

insert into public.progression_path_visibility (class_id, mode, updated_at)
select
  c.id,
  case when s.value = 'milestone' then 'milestone' else 'full' end,
  coalesce(s.updated_at, now())
from public.app_settings s
join public.classes c
  on c.id::text = replace(s.key, 'progression.path_visibility.class.', '')
where s.key like 'progression.path_visibility.class.%'
on conflict (class_id, student_id) do update
set mode = excluded.mode,
    updated_at = excluded.updated_at;

insert into public.progression_path_visibility (student_id, mode, updated_at)
select
  p.id,
  case when s.value = 'milestone' then 'milestone' else 'full' end,
  coalesce(s.updated_at, now())
from public.app_settings s
join public.portal_users p
  on p.id::text = replace(s.key, 'progression.path_visibility.student.', '')
where s.key like 'progression.path_visibility.student.%'
on conflict (class_id, student_id) do update
set mode = excluded.mode,
    updated_at = excluded.updated_at;

delete from public.app_settings
where key like 'progression.path_visibility.class.%'
   or key like 'progression.path_visibility.student.%';

alter table public.progression_path_visibility enable row level security;

comment on table public.progression_path_visibility is
  'Class defaults and learner overrides for path detail visibility. Service APIs enforce staff scope.';
