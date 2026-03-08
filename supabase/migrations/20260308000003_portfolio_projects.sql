-- ── portfolio_projects ────────────────────────────────────────
-- Stores student portfolio projects persistently in the DB.
-- Previously stored in localStorage only (data lost on clear/device change).

create table if not exists portfolio_projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references portal_users(id) on delete cascade,
  title        text not null,
  description  text,
  category     text not null default 'Coding',
  tags         text[] not null default '{}',
  project_url  text,
  image_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_portfolio_projects_user on portfolio_projects(user_id);

alter table portfolio_projects enable row level security;

-- Students can only see and manage their own projects
create policy "portfolio_own_select" on portfolio_projects
  for select using (user_id = auth.uid());

create policy "portfolio_own_insert" on portfolio_projects
  for insert with check (user_id = auth.uid());

create policy "portfolio_own_update" on portfolio_projects
  for update using (user_id = auth.uid());

create policy "portfolio_own_delete" on portfolio_projects
  for delete using (user_id = auth.uid());

-- Staff (admin/teacher/school) can view any student's portfolio
create policy "portfolio_staff_select" on portfolio_projects
  for select using (
    exists (
      select 1 from portal_users
      where id = auth.uid()
        and role in ('admin', 'teacher', 'school')
    )
  );
