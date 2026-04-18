-- migration: term_schedules table
-- requirements: nf-21.1

-- term_schedules: tracks the active term schedule for a lesson plan within a
-- school, including the current week progress and cadence for auto-advancing.
create table if not exists public.term_schedules (
  id               uuid        primary key default gen_random_uuid(),
  lesson_plan_id   uuid        not null references public.lesson_plans(id) on delete cascade,
  school_id        uuid        not null references public.schools(id),
  is_active        boolean     not null default false,
  current_week     int         not null default 1,
  term_start       date        not null,
  cadence_days     int         not null default 7,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- partial index for fast lookup of active schedules
create index if not exists idx_ts_active
  on public.term_schedules(is_active)
  where is_active = true;

-- ── row-level security ────────────────────────────────────────────────────────

alter table public.term_schedules enable row level security;

-- school admins can select schedules for their school
drop policy if exists "school admins select term schedules for their school" on public.term_schedules;
create policy "school admins select term schedules for their school"
  on public.term_schedules
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school')
        and pu.school_id = term_schedules.school_id
    )
  );

-- school admins can insert schedules for their school
drop policy if exists "school admins insert term schedules for their school" on public.term_schedules;
create policy "school admins insert term schedules for their school"
  on public.term_schedules
  for insert
  with check (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school')
        and pu.school_id = term_schedules.school_id
    )
  );

-- school admins can update schedules for their school
drop policy if exists "school admins update term schedules for their school" on public.term_schedules;
create policy "school admins update term schedules for their school"
  on public.term_schedules
  for update
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school')
        and pu.school_id = term_schedules.school_id
    )
  );

-- school admins can delete schedules for their school
drop policy if exists "school admins delete term schedules for their school" on public.term_schedules;
create policy "school admins delete term schedules for their school"
  on public.term_schedules
  for delete
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school')
        and pu.school_id = term_schedules.school_id
    )
  );

-- teachers can select schedules for their school (read-only)
drop policy if exists "teachers select term schedules for their school" on public.term_schedules;
create policy "teachers select term schedules for their school"
  on public.term_schedules
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      = 'teacher'
        and pu.school_id = term_schedules.school_id
    )
  );
