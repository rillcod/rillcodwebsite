-- Dynamic operations duty rota and workload ownership for the lean Rillcod team.

create table if not exists public.operations_staff_settings (
  user_id uuid primary key references public.portal_users(id) on delete cascade,
  is_primary_admin boolean not null default false,
  accepts_general_queue boolean not null default true,
  is_available boolean not null default true,
  unavailable_until timestamptz,
  max_active_cases integer not null default 8 check (max_active_cases between 1 and 50),
  skill_tags text[] not null default array[]::text[],
  notes text,
  updated_by uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- The organisation has one effective administrator, even if more than one admin
-- login exists. Select one account deterministically for restricted work.
update public.operations_staff_settings
set is_primary_admin = false
where is_primary_admin = true;

insert into public.operations_staff_settings (user_id, is_primary_admin)
select pu.id, true
from public.portal_users pu
where pu.role = 'admin'
  and coalesce(pu.is_active, true)
  and not coalesce(pu.is_deleted, false)
order by pu.created_at asc nulls last,
  pu.id
limit 1
on conflict (user_id) do update set is_primary_admin = excluded.is_primary_admin;

create unique index if not exists operations_one_primary_admin_idx
  on public.operations_staff_settings (is_primary_admin)
  where is_primary_admin = true;
create table if not exists public.operations_duty_rota (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.portal_users(id) on delete cascade,
  duty_kind text not null default 'general_service'
    check (duty_kind in ('general_service', 'academic_support', 'admissions', 'technical_support')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_primary boolean not null default true,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  notes text,
  created_by uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (staff_id, duty_kind, starts_at, ends_at)
);

create index if not exists operations_duty_rota_active_idx
  on public.operations_duty_rota (duty_kind, status, starts_at, ends_at);
create index if not exists operations_duty_rota_staff_idx
  on public.operations_duty_rota (staff_id, starts_at desc);

alter table public.feedback
  add column if not exists assigned_to uuid references public.portal_users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists department text not null default 'customer_care',
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists first_response_due_at timestamptz,
  add column if not exists resolved_at timestamptz;

create index if not exists feedback_assigned_status_idx
  on public.feedback (assigned_to, status, first_response_due_at);

alter table public.operations_staff_settings enable row level security;
alter table public.operations_duty_rota enable row level security;

create policy "operations staff can view staff settings"
  on public.operations_staff_settings for select to authenticated
  using (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid() and pu.role in ('admin', 'teacher') and coalesce(pu.is_active, true)
    )
  );

create policy "staff can create own operations settings"
  on public.operations_staff_settings for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid() and pu.role in ('admin', 'teacher') and coalesce(pu.is_active, true)
    )
  );

create policy "staff can update own operations settings"
  on public.operations_staff_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admins can manage all operations settings"
  on public.operations_staff_settings for all to authenticated
  using (exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin'))
  with check (exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin'));

create policy "operations staff can view duty rota"
  on public.operations_duty_rota for select to authenticated
  using (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid() and pu.role in ('admin', 'teacher') and coalesce(pu.is_active, true)
    )
  );

create policy "admins can manage duty rota"
  on public.operations_duty_rota for all to authenticated
  using (exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin'))
  with check (exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin'));

comment on table public.operations_staff_settings is 'Availability, skills, and safe workload capacity for active Rillcod operators and teachers.';
comment on table public.operations_duty_rota is 'Time-bounded primary and backup duty coverage. Staff count is discovered from portal_users.';
