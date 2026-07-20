-- Unified customer-service cases across WhatsApp, feedback, email, and in-app communication.
create table if not exists public.communication_cases (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references public.portal_users(id) on delete set null,
  requester_name text,
  requester_email text,
  requester_phone text,
  school_id uuid references public.schools(id) on delete set null,
  subject text not null,
  category text not null default 'general',
  department text not null default 'customer_care',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','pending_customer','in_progress','resolved','closed')),
  assigned_to uuid references public.portal_users(id) on delete set null,
  first_response_due_at timestamptz,
  next_follow_up_at timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  channels text[] not null default array[]::text[],
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.communication_cases(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email','in_app','feedback','system')),
  direction text not null check (direction in ('inbound','outbound','internal')),
  source_type text,
  source_id text,
  subject text,
  body text not null,
  actor_id uuid references public.portal_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists communication_case_event_source_idx
  on public.communication_case_events (source_type, source_id)
  where source_type is not null and source_id is not null;
create index if not exists communication_cases_owner_status_idx
  on public.communication_cases (assigned_to, status, first_response_due_at);
create index if not exists communication_cases_requester_idx
  on public.communication_cases (requester_id, status, updated_at desc);
create index if not exists communication_case_events_case_idx
  on public.communication_case_events (case_id, created_at);

alter table public.communication_cases enable row level security;
alter table public.communication_case_events enable row level security;

create policy "case participants can view cases" on public.communication_cases for select to authenticated
using (
  requester_id = auth.uid() or assigned_to = auth.uid() or
  exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin')
);
create policy "staff can update assigned cases" on public.communication_cases for update to authenticated
using (assigned_to = auth.uid() or exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin'))
with check (assigned_to = auth.uid() or exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin'));
create policy "case participants can view events" on public.communication_case_events for select to authenticated
using (exists (select 1 from public.communication_cases c where c.id = case_id and (c.requester_id = auth.uid() or c.assigned_to = auth.uid() or exists (select 1 from public.portal_users pu where pu.id = auth.uid() and pu.role = 'admin'))));

comment on table public.communication_cases is 'One accountable customer-service case spanning all supported communication channels.';
comment on table public.communication_case_events is 'Immutable cross-channel history for a communication case.';
