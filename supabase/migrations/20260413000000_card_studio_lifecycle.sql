-- Card Studio lifecycle, scan logs, and audit trail

create table if not exists public.identity_cards (
  id uuid primary key default gen_random_uuid(),
  holder_type text not null check (holder_type in ('student', 'parent', 'teacher')),
  holder_id uuid not null references public.portal_users(id) on delete cascade,
  school_id uuid null references public.schools(id) on delete set null,
  class_id uuid null references public.classes(id) on delete set null,
  card_number text not null unique,
  verification_code text not null unique,
  status text not null default 'issued' check (status in ('issued', 'active', 'revoked', 'expired')),
  template_type text not null default 'student' check (template_type in ('student', 'parent', 'teacher')),
  issued_at timestamptz not null default now(),
  activated_at timestamptz null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revoked_reason text null,
  created_by uuid null references public.portal_users(id) on delete set null,
  updated_by uuid null references public.portal_users(id) on delete set null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_scan_logs (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.identity_cards(id) on delete cascade,
  scanned_by uuid null references public.portal_users(id) on delete set null,
  school_id uuid null references public.schools(id) on delete set null,
  source text not null default 'web' check (source in ('web', 'qr', 'api')),
  scan_result text not null default 'ok' check (scan_result in ('ok', 'revoked', 'expired', 'invalid')),
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.card_audit_logs (
  id uuid primary key default gen_random_uuid(),
  card_id uuid null references public.identity_cards(id) on delete set null,
  actor_id uuid null references public.portal_users(id) on delete set null,
  school_id uuid null references public.schools(id) on delete set null,
  action text not null,
  entity text not null default 'identity_card',
  details jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_identity_cards_holder on public.identity_cards(holder_type, holder_id);
create index if not exists idx_identity_cards_status on public.identity_cards(status);
create index if not exists idx_identity_cards_school on public.identity_cards(school_id);
create index if not exists idx_card_scan_logs_card on public.card_scan_logs(card_id, created_at desc);
create index if not exists idx_card_audit_logs_card on public.card_audit_logs(card_id, created_at desc);
create index if not exists idx_card_audit_logs_actor on public.card_audit_logs(actor_id, created_at desc);

alter table public.identity_cards enable row level security;
alter table public.card_scan_logs enable row level security;
alter table public.card_audit_logs enable row level security;

drop policy if exists "staff_manage_identity_cards" on public.identity_cards;
create policy "staff_manage_identity_cards"
on public.identity_cards
for all
to authenticated
using (public.is_staff() or public.is_admin())
with check (public.is_staff() or public.is_admin());

drop policy if exists "staff_view_card_scan_logs" on public.card_scan_logs;
create policy "staff_view_card_scan_logs"
on public.card_scan_logs
for select
to authenticated
using (public.is_staff() or public.is_admin());

drop policy if exists "staff_insert_card_scan_logs" on public.card_scan_logs;
create policy "staff_insert_card_scan_logs"
on public.card_scan_logs
for insert
to authenticated
with check (public.is_staff() or public.is_admin());

drop policy if exists "staff_view_card_audit_logs" on public.card_audit_logs;
create policy "staff_view_card_audit_logs"
on public.card_audit_logs
for select
to authenticated
using (public.is_staff() or public.is_admin());

drop policy if exists "staff_insert_card_audit_logs" on public.card_audit_logs;
create policy "staff_insert_card_audit_logs"
on public.card_audit_logs
for insert
to authenticated
with check (public.is_staff() or public.is_admin());

