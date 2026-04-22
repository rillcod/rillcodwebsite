-- Stage 2: progression engine foundation (school-role regular-school scope)

create table if not exists public.curriculum_project_registry (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  project_key text not null unique,
  title text not null,
  track text not null
    check (track in ('young_innovator', 'scratch', 'python', 'html_css', 'intro_ai_tools', 'mixed')),
  concept_tags text[] not null default '{}',
  difficulty_level int not null default 1 check (difficulty_level between 1 and 10),
  classwork_prompt text,
  estimated_minutes int check (estimated_minutes is null or estimated_minutes > 0),
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_curriculum_project_registry_scope
  on public.curriculum_project_registry(program_id, course_id, track, is_active);
create index if not exists idx_curriculum_project_registry_school
  on public.curriculum_project_registry(school_id, track);

create table if not exists public.curriculum_project_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.curriculum_project_registry(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  lesson_plan_id uuid references public.lesson_plans(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  year_number int not null check (year_number between 1 and 10),
  term_number int not null check (term_number between 1 and 3),
  week_number int not null check (week_number >= 1),
  is_repeat boolean not null default false,
  used_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_curriculum_project_usage_recent
  on public.curriculum_project_usage(school_id, project_id, used_at desc);
create index if not exists idx_curriculum_project_usage_term
  on public.curriculum_project_usage(school_id, year_number, term_number, week_number);

create table if not exists public.curriculum_week_performance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  student_id uuid not null references public.portal_users(id) on delete cascade,
  year_number int not null check (year_number between 1 and 10),
  term_number int not null check (term_number between 1 and 3),
  week_number int not null check (week_number >= 1),
  practical_score numeric(5,2) not null default 0 check (practical_score between 0 and 100),
  completion_seconds int not null default 0 check (completion_seconds >= 0),
  retry_count int not null default 0 check (retry_count >= 0),
  completed boolean not null default false,
  recorded_by uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_plan_id, year_number, term_number, week_number)
);

create index if not exists idx_curriculum_week_performance_scope
  on public.curriculum_week_performance(school_id, lesson_plan_id, week_number);

alter table public.curriculum_project_registry enable row level security;
alter table public.curriculum_project_usage enable row level security;
alter table public.curriculum_week_performance enable row level security;

drop policy if exists "school staff manage curriculum project registry" on public.curriculum_project_registry;
create policy "school staff manage curriculum project registry"
  on public.curriculum_project_registry
  for all
  using (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher', 'school')
        and (
          curriculum_project_registry.school_id is null
          or pu.school_id = curriculum_project_registry.school_id
          or pu.role = 'admin'
        )
    )
  )
  with check (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher', 'school')
        and (
          curriculum_project_registry.school_id is null
          or pu.school_id = curriculum_project_registry.school_id
          or pu.role = 'admin'
        )
    )
  );

drop policy if exists "school staff read project usage" on public.curriculum_project_usage;
create policy "school staff read project usage"
  on public.curriculum_project_usage
  for select
  using (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher', 'school')
        and (pu.school_id = curriculum_project_usage.school_id or pu.role = 'admin')
    )
  );

drop policy if exists "school staff insert project usage" on public.curriculum_project_usage;
create policy "school staff insert project usage"
  on public.curriculum_project_usage
  for insert
  with check (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher', 'school')
        and (pu.school_id = curriculum_project_usage.school_id or pu.role = 'admin')
    )
  );

drop policy if exists "school staff manage week performance" on public.curriculum_week_performance;
create policy "school staff manage week performance"
  on public.curriculum_week_performance
  for all
  using (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher', 'school')
        and (pu.school_id = curriculum_week_performance.school_id or pu.role = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher', 'school')
        and (pu.school_id = curriculum_week_performance.school_id or pu.role = 'admin')
    )
  );
