-- #4: billing_cycles.items JSON (rolled-up open student/school invoices)
-- #9–10: instalment flag on programs, payment_plan on students, commission + settlements

alter table public.billing_cycles
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists rillcod_retain_amount numeric null,
  add column if not exists school_settlement_amount numeric null;

comment on column public.billing_cycles.items is 'Array of { invoice_id, invoice_number, amount, currency, status, student_name } included in this cycle';

alter table public.schools
  add column if not exists commission_rate numeric not null default 15
  check (commission_rate >= 0 and commission_rate <= 100);

comment on column public.schools.commission_rate is 'Percent of cycle amount retained by Rillcod before partner settlement';

alter table public.programs
  add column if not exists instalments_enabled boolean not null default false,
  add column if not exists default_currency text not null default 'NGN';

alter table public.students
  add column if not exists payment_plan text not null default 'full'
  check (payment_plan in ('full', 'instalment'));

create table if not exists public.school_settlements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  billing_cycle_id uuid null references public.billing_cycles(id) on delete set null,
  amount numeric not null,
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'void')),
  reference text null,
  notes text null,
  paid_at timestamptz null,
  paid_by uuid null references public.portal_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_settlements_school_status
  on public.school_settlements(school_id, status);
create index if not exists idx_school_settlements_cycle
  on public.school_settlements(billing_cycle_id);

alter table public.school_settlements enable row level security;

drop policy if exists "admin_all_school_settlements" on public.school_settlements;
create policy "admin_all_school_settlements"
  on public.school_settlements for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Ops: default programme UUID for public registration when program_id omitted (set value in dashboard / SQL)
insert into public.app_settings (key, value)
values ('default_registration_program_id', '')
on conflict (key) do nothing;
