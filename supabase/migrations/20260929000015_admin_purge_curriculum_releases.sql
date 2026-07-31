-- Admin-only purge for official curriculum releases.
-- Child tables use ON DELETE RESTRICT, and teaching-plan triggers refuse to
-- null curriculum_release_id while class/course/term are set — so a normal
-- DELETE on academic_curriculum_releases fails. This function clears every
-- blocker (including trigger-guarded columns) then removes the releases.

create or replace function public.admin_purge_curriculum_releases(p_release_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_release_ids, '{}');
  v_deleted int := 0;
begin
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', true, 'deleted', 0);
  end if;

  -- Directional state must be removed (release_id is NOT NULL).
  delete from public.academic_curriculum_delivery_schedules
  where release_id = any(v_ids);

  delete from public.academic_offering_curriculum_directions
  where release_id = any(v_ids);

  delete from public.academic_curriculum_adoptions
  where release_id = any(v_ids);

  -- Bypass BEFORE UPDATE triggers that would re-attach or reject nulling.
  perform set_config('session_replication_role', 'replica', true);

  delete from public.curriculum_week_tracking
  where curriculum_release_id = any(v_ids);

  update public.lesson_plans
  set curriculum_release_id = null
  where curriculum_release_id = any(v_ids);

  update public.assignments
  set curriculum_release_id = null
  where curriculum_release_id = any(v_ids);

  update public.cbt_exams
  set curriculum_release_id = null
  where curriculum_release_id = any(v_ids);

  update public.exams
  set curriculum_release_id = null
  where curriculum_release_id = any(v_ids);

  update public.student_progress_reports
  set curriculum_release_id = null
  where curriculum_release_id = any(v_ids);

  update public.enrollment_term_grades
  set curriculum_release_id = null
  where curriculum_release_id = any(v_ids);

  update public.academic_assessment_evidence
  set curriculum_release_id = null
  where curriculum_release_id = any(v_ids);

  delete from public.academic_curriculum_releases
  where id = any(v_ids);
  get diagnostics v_deleted = row_count;

  perform set_config('session_replication_role', 'origin', true);

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
exception
  when others then
    perform set_config('session_replication_role', 'origin', true);
    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm,
      'hint', sqlstate
    );
end;
$$;

revoke all on function public.admin_purge_curriculum_releases(uuid[]) from public;
grant execute on function public.admin_purge_curriculum_releases(uuid[]) to service_role;

comment on function public.admin_purge_curriculum_releases(uuid[]) is
  'Service-role curriculum wipe helper: clears RESTRICT blockers and trigger-guarded release pointers, then deletes the releases.';
