-- Inbox SLA/priority metadata and CRM task/opportunity foundations.

create table if not exists public.communication_conversation_meta (
  conversation_id uuid primary key references public.whatsapp_conversations(id) on delete cascade,
  priority text not null default 'medium',
  sla_due_at timestamptz,
  status text not null default 'open',
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  updated_by uuid references public.portal_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  notes text
);

create index if not exists communication_conversation_meta_sla_idx
  on public.communication_conversation_meta (status, priority, sla_due_at);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  contact_name text not null,
  title text not null,
  due_at timestamptz,
  status text not null default 'open',
  priority text not null default 'medium',
  owner_id uuid references public.portal_users(id) on delete set null,
  owner_name text,
  created_by uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tasks_status_due_idx
  on public.crm_tasks (status, due_at);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null,
  contact_name text not null,
  stage text not null default 'new_inquiry',
  estimated_value numeric(12,2),
  source text,
  close_probability integer default 10,
  expected_close_at timestamptz,
  owner_id uuid references public.portal_users(id) on delete set null,
  owner_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_opportunities_stage_idx
  on public.crm_opportunities (stage, expected_close_at);

alter table public.communication_conversation_meta enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_opportunities enable row level security;
