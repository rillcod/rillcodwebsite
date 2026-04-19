-- migration: course_curricula table
-- requirements: nf-16.2

-- course_curricula: stores the canonical curriculum content for a given
-- course+school combination. schools can maintain their own curriculum version
-- independently of the global course definition.
create table if not exists public.course_curricula (
  id          uuid        primary key default gen_random_uuid(),
  course_id   uuid        not null references public.courses(id),
  school_id   uuid        not null references public.schools(id),
  content     jsonb       not null default '{}',
  version     int         not null default 1,
  created_by  uuid        not null references public.portal_users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (course_id, school_id)
);

-- ── deferred fk from migration 11 ────────────────────────────────────────────
-- lesson_plans.curriculum_version_id was added without a fk in migration 11
-- because course_curricula did not exist yet. now that the table exists, add
-- the constraint.
alter table public.lesson_plans
  add constraint fk_lesson_plans_curriculum
    foreign key (curriculum_version_id) references public.course_curricula(id);

-- ── row-level security ────────────────────────────────────────────────────────

alter table public.course_curricula enable row level security;

-- staff can select curricula for their school
drop policy if exists "school admins select curricula for their school" on public.course_curricula;
drop policy if exists "teachers select curricula for their school" on public.course_curricula;
drop policy if exists "staff select curricula for their school" on public.course_curricula;
create policy "staff select curricula for their school"
  on public.course_curricula
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school', 'teacher')
        and pu.school_id = course_curricula.school_id
    )
  );

-- staff can insert curricula for their school
drop policy if exists "school admins insert curricula for their school" on public.course_curricula;
drop policy if exists "staff insert curricula for their school" on public.course_curricula;
create policy "staff insert curricula for their school"
  on public.course_curricula
  for insert
  with check (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school', 'teacher')
        and pu.school_id = course_curricula.school_id
      )
  );

-- staff can update curricula for their school
drop policy if exists "school admins update curricula for their school" on public.course_curricula;
drop policy if exists "staff update curricula for their school" on public.course_curricula;
create policy "staff update curricula for their school"
  on public.course_curricula
  for update
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school', 'teacher')
        and pu.school_id = course_curricula.school_id
    )
  );

-- school admins can delete curricula for their school (admins only for safety)
drop policy if exists "school admins delete curricula for their school" on public.course_curricula;
create policy "school admins delete curricula for their school"
  on public.course_curricula
  for delete
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'school_admin', 'school')
        and pu.school_id = course_curricula.school_id
    )
  );
