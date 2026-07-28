-- A teacher can reuse the same delivery style across assigned class plans without
-- copying or changing the official academic direction.

create table if not exists public.teacher_delivery_patterns (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_plan_pattern_applications (
  id uuid primary key default gen_random_uuid(),
  pattern_id uuid not null references public.teacher_delivery_patterns(id) on delete cascade,
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  pattern_snapshot jsonb not null,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  unique (pattern_id, lesson_plan_id)
);

alter table public.teacher_delivery_patterns enable row level security;
alter table public.lesson_plan_pattern_applications enable row level security;

create policy teacher_pattern_owner_manage
on public.teacher_delivery_patterns for all
using (teacher_id = auth.uid() or public.is_admin())
with check (teacher_id = auth.uid() or public.is_admin());

create policy teacher_pattern_application_read
on public.lesson_plan_pattern_applications for select
using (
  public.is_admin()
  or exists (
    select 1 from public.teacher_delivery_patterns pattern
    where pattern.id = lesson_plan_pattern_applications.pattern_id
      and pattern.teacher_id = auth.uid()
  )
);

create index if not exists teacher_delivery_patterns_owner_idx
  on public.teacher_delivery_patterns(teacher_id, status, updated_at desc);
create index if not exists lesson_plan_pattern_applications_plan_idx
  on public.lesson_plan_pattern_applications(lesson_plan_id, applied_at desc);

comment on table public.teacher_delivery_patterns is
  'Reusable teacher-owned activities, examples, materials, and routines; never curriculum topics, sequence, grade, or learning outcomes.';

