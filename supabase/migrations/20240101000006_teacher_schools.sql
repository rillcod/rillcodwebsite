-- ============================================================
-- Migration 006: Teacher-School assignments
-- A teacher can be assigned to one or more partner schools
-- ============================================================

-- ── teacher_schools junction table ───────────────────────────
create table if not exists teacher_schools (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references portal_users(id) on delete cascade,
  school_id    uuid not null references schools(id) on delete cascade,
  assigned_by  uuid references portal_users(id) on delete set null,
  assigned_at  timestamptz default now(),
  is_primary   boolean default false,   -- one "home" school
  notes        text,
  unique(teacher_id, school_id)
);

create index if not exists idx_teacher_schools_teacher on teacher_schools(teacher_id);
create index if not exists idx_teacher_schools_school  on teacher_schools(school_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table teacher_schools enable row level security;

-- Admins: full access
do $$ begin
  create policy "teacher_schools_admin_all" on teacher_schools for all
    using (exists (select 1 from portal_users where id = auth.uid() and role = 'admin'))
    with check (exists (select 1 from portal_users where id = auth.uid() and role = 'admin'));
exception when duplicate_object then null; end $$;

-- Teachers: can read their own assignments
do $$ begin
  create policy "teacher_schools_teacher_select" on teacher_schools for select
    using (teacher_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ── Add school_id to classes table (optional but useful) ─────
alter table classes
  add column if not exists school_id uuid references schools(id) on delete set null;

create index if not exists idx_classes_school on classes(school_id);
