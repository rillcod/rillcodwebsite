-- Billing automation for termly reminders (weeks 6, 7, 8)

alter table if exists public.subscriptions
  add column if not exists owner_type text not null default 'school' check (owner_type in ('school', 'individual')),
  add column if not exists school_id uuid null references public.schools(id) on delete set null,
  add column if not exists pricing_model text not null default 'fixed_school' check (pricing_model in ('fixed_school', 'per_student', 'individual_personal', 'individual_online')),
  add column if not exists fixed_amount numeric null,
  add column if not exists price_per_student numeric null,
  add column if not exists billing_channel text null,
  add column if not exists auto_rollover boolean not null default true;

create table if not exists public.billing_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  representative_name text null,
  representative_email text null,
  representative_whatsapp text null,
  teacher_id uuid null references public.portal_users(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id)
);

create table if not exists public.billing_cycles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid null references public.subscriptions(id) on delete set null,
  owner_type text not null check (owner_type in ('school', 'individual')),
  owner_school_id uuid null references public.schools(id) on delete set null,
  owner_user_id uuid null references public.portal_users(id) on delete set null,
  school_id uuid null references public.schools(id) on delete set null,
  invoice_id uuid null references public.invoices(id) on delete set null,
  term_label text not null,
  term_start_date date not null,
  due_date date not null,
  amount_due numeric not null default 0,
  currency text not null default 'NGN',
  status text not null default 'due' check (status in ('due', 'past_due', 'paid', 'cancelled', 'rolled_over')),
  reminder_week6_sent_at timestamptz null,
  reminder_week7_sent_at timestamptz null,
  reminder_week8_sent_at timestamptz null,
  sticky_notice_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  billing_cycle_id uuid not null references public.billing_cycles(id) on delete cascade,
  week_number int not null check (week_number in (6, 7, 8)),
  channel text not null check (channel in ('in_app', 'email', 'whatsapp')),
  target text null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_notices (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('school', 'individual')),
  owner_school_id uuid null references public.schools(id) on delete set null,
  owner_user_id uuid null references public.portal_users(id) on delete set null,
  title text not null,
  message text not null,
  due_date date null,
  is_sticky boolean not null default true,
  is_resolved boolean not null default false,
  resolved_at timestamptz null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_cycles_status_due on public.billing_cycles(status, due_date);
create index if not exists idx_billing_cycles_owner_school on public.billing_cycles(owner_school_id);
create index if not exists idx_billing_cycles_owner_user on public.billing_cycles(owner_user_id);
create index if not exists idx_billing_logs_cycle_week on public.billing_reminder_logs(billing_cycle_id, week_number);
create index if not exists idx_billing_notices_open on public.billing_notices(is_resolved, due_date);

alter table public.billing_contacts enable row level security;
alter table public.billing_cycles enable row level security;
alter table public.billing_reminder_logs enable row level security;
alter table public.billing_notices enable row level security;

drop policy if exists "staff_manage_billing_contacts" on public.billing_contacts;
create policy "staff_manage_billing_contacts"
on public.billing_contacts for all to authenticated
using (public.is_staff() or public.is_admin())
with check (public.is_staff() or public.is_admin());

drop policy if exists "staff_view_billing_cycles" on public.billing_cycles;
create policy "staff_view_billing_cycles"
on public.billing_cycles for select to authenticated
using (public.is_staff() or public.is_admin());

drop policy if exists "staff_insert_billing_cycles" on public.billing_cycles;
create policy "staff_insert_billing_cycles"
on public.billing_cycles for insert to authenticated
with check (public.is_staff() or public.is_admin());

drop policy if exists "staff_update_billing_cycles" on public.billing_cycles;
create policy "staff_update_billing_cycles"
on public.billing_cycles for update to authenticated
using (public.is_staff() or public.is_admin())
with check (public.is_staff() or public.is_admin());

drop policy if exists "staff_view_billing_notices" on public.billing_notices;
create policy "staff_view_billing_notices"
on public.billing_notices for select to authenticated
using (public.is_staff() or public.is_admin());

drop policy if exists "staff_manage_billing_notices" on public.billing_notices;
create policy "staff_manage_billing_notices"
on public.billing_notices for all to authenticated
using (public.is_staff() or public.is_admin())
with check (public.is_staff() or public.is_admin());

