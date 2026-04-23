-- Additive safety tables for communication throttling and moderation.

create table if not exists public.communication_rate_limits (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.portal_users(id) on delete cascade,
  sender_role text not null,
  day_bucket timestamptz not null,
  daily_count integer not null default 0,
  last_message_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists communication_rate_limits_sender_day_uidx
  on public.communication_rate_limits (sender_id, day_bucket);

create index if not exists communication_rate_limits_day_idx
  on public.communication_rate_limits (day_bucket desc);

create table if not exists public.communication_abuse_events (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.portal_users(id) on delete set null,
  sender_role text,
  channel text not null,
  event_type text not null,
  reason text not null,
  target_conversation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists communication_abuse_events_sender_idx
  on public.communication_abuse_events (sender_id, created_at desc);

create index if not exists communication_abuse_events_type_idx
  on public.communication_abuse_events (event_type, created_at desc);

create table if not exists public.communication_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.portal_users(id) on delete cascade,
  reporter_role text not null,
  target_conversation_id uuid,
  target_message_id uuid,
  reason text not null,
  details text,
  status text not null default 'open',
  reviewed_by uuid references public.portal_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_reports_status_idx
  on public.communication_reports (status, created_at desc);

create index if not exists communication_reports_conversation_idx
  on public.communication_reports (target_conversation_id, created_at desc);

create table if not exists public.communication_escalations (
  id uuid primary key default gen_random_uuid(),
  target_conversation_id uuid,
  target_user_id uuid references public.portal_users(id) on delete set null,
  trigger text not null,
  trigger_count integer not null default 0,
  status text not null default 'open',
  notes text,
  resolved_by uuid references public.portal_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_escalations_status_idx
  on public.communication_escalations (status, created_at desc);

alter table public.communication_rate_limits enable row level security;
alter table public.communication_abuse_events enable row level security;
alter table public.communication_reports enable row level security;
alter table public.communication_escalations enable row level security;
