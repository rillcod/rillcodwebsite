create table if not exists public.academic_curriculum_quality_runs (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid references public.course_curricula(id) on delete set null,
  release_id uuid references public.academic_curriculum_releases(id) on delete set null,
  engine_version text not null default 'academic_quality_v2',
  readiness text not null check (readiness in ('ready', 'needs_attention', 'not_ready')),
  score integer not null check (score between 0 and 100),
  report jsonb not null,
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz not null default now(),
  constraint academic_quality_run_target_check check (curriculum_id is not null or release_id is not null)
);

create index if not exists academic_quality_runs_curriculum_idx
  on public.academic_curriculum_quality_runs(curriculum_id, checked_at desc);
create index if not exists academic_quality_runs_release_idx
  on public.academic_curriculum_quality_runs(release_id, checked_at desc);

alter table public.academic_curriculum_quality_runs enable row level security;

drop policy if exists academic_quality_runs_admin_read on public.academic_curriculum_quality_runs;
create policy academic_quality_runs_admin_read
on public.academic_curriculum_quality_runs for select
using (exists (
  select 1 from public.portal_users
  where id = auth.uid() and role = 'admin'
));

drop policy if exists academic_quality_runs_admin_insert on public.academic_curriculum_quality_runs;
create policy academic_quality_runs_admin_insert
on public.academic_curriculum_quality_runs for insert
with check (exists (
  select 1 from public.portal_users
  where id = auth.uid() and role = 'admin'
));

comment on table public.academic_curriculum_quality_runs is
  'Auditable results from the central academic quality engine. Downstream teacher tools consume approved direction and do not configure QA.';

