-- Keep only the newest 15 cron run rows per job. Older rows are deleted after
-- each insert so process-notifications cannot grow history without bound.

create or replace function public.prune_cron_run_history(
  p_job_name text,
  p_keep_count integer default 15
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  if btrim(coalesce(p_job_name, '')) = '' then
    raise exception 'job name is required';
  end if;
  if p_keep_count < 1 or p_keep_count > 500 then
    raise exception 'keep count must be between 1 and 500';
  end if;

  with ranked as (
    select id
    from public.cron_run_history
    where job_name = btrim(p_job_name)
    order by created_at desc, id desc
    offset p_keep_count
  )
  delete from public.cron_run_history h
  using ranked r
  where h.id = r.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.prune_all_cron_run_history(
  p_keep_count integer default 15
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j record;
  v_total integer := 0;
begin
  if p_keep_count < 1 or p_keep_count > 500 then
    raise exception 'keep count must be between 1 and 500';
  end if;

  for j in
    select distinct job_name
    from public.cron_run_history
    order by job_name
  loop
    v_total := v_total + public.prune_cron_run_history(j.job_name, p_keep_count);
  end loop;

  return v_total;
end;
$$;

revoke all on function public.prune_cron_run_history(text, integer) from public, anon, authenticated;
revoke all on function public.prune_all_cron_run_history(integer) from public, anon, authenticated;
grant execute on function public.prune_cron_run_history(text, integer) to service_role;
grant execute on function public.prune_all_cron_run_history(integer) to service_role;

comment on function public.prune_cron_run_history(text, integer) is
  'Deletes cron_run_history rows older than the newest p_keep_count entries for one job.';
comment on function public.prune_all_cron_run_history(integer) is
  'Trims every job in cron_run_history to the newest p_keep_count rows.';

comment on table public.cron_run_history is
  'Rolling cron execution history; application code keeps the newest 15 rows per job.';

select public.prune_all_cron_run_history(15);
