-- Keep Auto-fill from recalculating a result version the teacher is no longer
-- looking at. The existing central calculator already locks the report row;
-- this wrapper adds the browser/version comparison inside that same database
-- transaction before any derived components are replaced.

create or replace function public.recalculate_academic_result_guarded(
  p_report_id uuid,
  p_actor_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_at timestamptz;
begin
  select updated_at
    into v_updated_at
  from public.student_progress_reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Progress report not found.';
  end if;

  if v_updated_at is distinct from p_expected_updated_at then
    raise exception using
      message = 'REPORT_VERSION_CONFLICT',
      hint = 'Reload the latest report draft before recalculating.';
  end if;

  return public.recalculate_academic_result(p_report_id, p_actor_id);
end;
$$;

revoke all on function public.recalculate_academic_result_guarded(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.recalculate_academic_result_guarded(uuid, uuid, timestamptz)
  to service_role;

comment on function public.recalculate_academic_result_guarded(uuid, uuid, timestamptz) is
  'Version-guarded entry point for the central automatic result calculator. Locks the report and refuses stale Auto-fill requests before replacing derived components.';
