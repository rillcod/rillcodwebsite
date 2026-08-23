-- Non-blocking browser security observations. No request body, cookies, query
-- strings, referrers, account ids, or customer identifiers are retained.
create table if not exists public.security_observations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('csp')),
  document_path text,
  blocked_origin text,
  violated_directive text,
  effective_directive text,
  disposition text,
  source_path text,
  line_number integer,
  column_number integer,
  status_code integer,
  observed_at timestamptz not null default now()
);

create index if not exists security_observations_recent_idx
  on public.security_observations (observed_at desc);
create index if not exists security_observations_directive_idx
  on public.security_observations (effective_directive, observed_at desc);

alter table public.security_observations enable row level security;
revoke all on public.security_observations from anon, authenticated;
grant select on public.security_observations to authenticated;

drop policy if exists "Admins can read security observations" on public.security_observations;
create policy "Admins can read security observations"
  on public.security_observations for select to authenticated
  using (exists (
    select 1 from public.portal_users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and coalesce(u.is_active, false) = true
      and coalesce(u.is_deleted, false) = false
  ));

comment on table public.security_observations is
  'Sanitized CSP observation evidence used before policy enforcement; contains no request payload or customer identifier.';
