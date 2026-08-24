-- One durable lease per scheduled job. External schedulers, fan-out and an
-- administrator can all reach the same route; without a database claim those
-- requests may overlap on different container instances and double-send work.

create table if not exists public.cron_job_leases (
  job_name text primary key,
  run_id uuid not null,
  claimed_at timestamptz not null default now(),
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint cron_job_leases_job_name_not_blank check (btrim(job_name) <> ''),
  constraint cron_job_leases_valid_window check (lease_until > claimed_at)
);

alter table public.cron_job_leases enable row level security;
revoke all on table public.cron_job_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.cron_job_leases to service_role;

create or replace function public.claim_cron_job_run(
  p_job_name text,
  p_run_id uuid,
  p_lease_seconds integer default 600
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acquired boolean := false;
begin
  if btrim(coalesce(p_job_name, '')) = '' then
    raise exception 'job name is required';
  end if;
  if p_run_id is null then
    raise exception 'run id is required';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'lease must be between 30 and 3600 seconds';
  end if;

  insert into public.cron_job_leases(job_name, run_id, claimed_at, lease_until, updated_at)
  values (btrim(p_job_name), p_run_id, now(), now() + make_interval(secs => p_lease_seconds), now())
  on conflict (job_name) do update set
    run_id = excluded.run_id,
    claimed_at = excluded.claimed_at,
    lease_until = excluded.lease_until,
    updated_at = excluded.updated_at
  where public.cron_job_leases.lease_until <= now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_cron_job_run(
  p_job_name text,
  p_run_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released boolean := false;
begin
  delete from public.cron_job_leases
  where job_name = btrim(coalesce(p_job_name, ''))
    and run_id = p_run_id
  returning true into v_released;
  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_cron_job_run(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_cron_job_run(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_cron_job_run(text, uuid, integer) to service_role;
grant execute on function public.release_cron_job_run(text, uuid) to service_role;

comment on table public.cron_job_leases is
  'Short-lived cross-instance leases preventing scheduler, fan-out and manual cron runs from overlapping.';
comment on function public.claim_cron_job_run(text, uuid, integer) is
  'Atomically acquires or takes over an expired scheduled-job lease.';
comment on function public.release_cron_job_run(text, uuid) is
  'Releases only the lease owned by the supplied run id; a stale run cannot release its successor.';
