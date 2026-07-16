create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text,
  account_role text,
  reason text,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  retention_note text,
  admin_note text
);

create index if not exists account_deletion_requests_user_idx on public.account_deletion_requests(user_id);
create index if not exists account_deletion_requests_email_idx on public.account_deletion_requests(lower(email));
create index if not exists account_deletion_requests_status_idx on public.account_deletion_requests(status, requested_at desc);
alter table public.account_deletion_requests enable row level security;
grant all on public.account_deletion_requests to service_role;
revoke all on public.account_deletion_requests from anon, authenticated;
comment on table public.account_deletion_requests is 'Auditable user requests for deletion of app accounts and associated personal data.';