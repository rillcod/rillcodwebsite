-- Central Academic Office controls. Security-definer calculation functions are
-- service-only; authenticated users reach them through scoped application APIs.

revoke execute on function public.evaluate_progress_report_academic_qa(uuid) from authenticated;
revoke execute on function public.recalculate_traceable_progress_report(uuid,uuid) from authenticated;
grant execute on function public.evaluate_progress_report_academic_qa(uuid) to service_role;
grant execute on function public.recalculate_traceable_progress_report(uuid,uuid) to service_role;

create or replace function public.publish_academic_assessment_scheme(
  p_name text,
  p_components jsonb,
  p_actor_id uuid,
  p_school_ids uuid[] default null,
  p_course_id uuid default null,
  p_academic_term_id uuid default null
)
returns setof public.academic_assessment_schemes
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_school uuid;
  v_targets uuid[];
  v_row public.academic_assessment_schemes%rowtype;
begin
  select role into v_role from public.portal_users where id=p_actor_id;
  if coalesce(v_role,'')<>'admin' then
    raise exception using errcode='42501',message='Only the Academic Office can publish result weighting schemes.';
  end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Give this weighting scheme a clear name.'; end if;
  v_targets:=case when coalesce(array_length(p_school_ids,1),0)=0 then array[null::uuid] else p_school_ids end;

  foreach v_school in array v_targets loop
    update public.academic_assessment_schemes set status='archived',updated_at=now()
    where status='active' and school_id is not distinct from v_school
      and course_id is not distinct from p_course_id
      and academic_term_id is not distinct from p_academic_term_id;
    insert into public.academic_assessment_schemes(
      name,school_id,course_id,academic_term_id,components,status,created_by,approved_by
    ) values (
      btrim(p_name),v_school,p_course_id,p_academic_term_id,p_components,'active',p_actor_id,p_actor_id
    ) returning * into v_row;
    return next v_row;
  end loop;
end;
$$;

revoke all on function public.publish_academic_assessment_scheme(text,jsonb,uuid,uuid[],uuid,uuid) from public,authenticated;
grant execute on function public.publish_academic_assessment_scheme(text,jsonb,uuid,uuid[],uuid,uuid) to service_role;

comment on function public.publish_academic_assessment_scheme(text,jsonb,uuid,uuid[],uuid,uuid) is
  'Publishes one validated 100% weighting scheme centrally to all schools or selected schools in a single Academic Office action.';
