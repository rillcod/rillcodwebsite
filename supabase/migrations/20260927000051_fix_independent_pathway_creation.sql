-- Corrected creator: enrollment_type is required by the academic pathway guard.
create or replace function public.create_independent_academic_pathway_v2(
  p_title text,p_pathway text,p_programme_id uuid,p_school_id uuid,
  p_starts_on date,p_ends_on date,p_actor_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor public.portal_users%rowtype; v_offering_id uuid; v_label text;
begin
  select * into v_actor from public.portal_users where id=p_actor_id;
  if v_actor.id is null then raise exception 'Academic pathway owner was not found.'; end if;
  if p_pathway not in ('online_school','bootcamp','holiday_programme','short_course') then raise exception 'Choose an Online School or Special Programme pathway.'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'Pathway name is required.'; end if;
  if not exists(select 1 from public.programs where id=p_programme_id and coalesce(is_active,true)) then raise exception 'Choose an active programme.'; end if;
  if p_ends_on is not null and p_starts_on is not null and p_ends_on<p_starts_on then raise exception 'The end date cannot be before the start date.'; end if;
  if v_actor.role='school' then
    if v_actor.school_id is null or p_school_id is distinct from v_actor.school_id then raise exception 'The pathway must belong to your school.'; end if;
  elsif v_actor.role<>'admin' then raise exception 'Only the Academic Office or an authorised school can create this pathway.';
  end if;

  insert into public.academic_offerings(
    title,pathway,enrollment_type,programme_id,school_id,calendar_mode,result_destination,
    starts_on,ends_on,status,delivery_mode,created_by,settings
  ) values(
    btrim(p_title),p_pathway,case when p_pathway='online_school' then 'online' else 'special' end,
    p_programme_id,p_school_id,case when p_pathway='online_school' then 'school_calendar' else 'fixed_dates' end,
    case when p_pathway='online_school' and p_school_id is not null then 'school_report'
         when p_pathway='online_school' then 'transcript_only' else 'standalone' end,
    p_starts_on,p_ends_on,'active',case when p_pathway='online_school' then 'virtual' else 'hybrid' end,
    p_actor_id,jsonb_build_object('source','academic_office','independent_pathway',true)
  ) returning id into v_offering_id;
  v_label:=case when p_pathway='online_school' then 'First Term' else btrim(p_title) end;
  insert into public.academic_offering_periods(offering_id,label,sequence_number,starts_on,ends_on,status)
  values(v_offering_id,v_label,1,p_starts_on,p_ends_on,'active');
  return v_offering_id;
end; $$;
revoke all on function public.create_independent_academic_pathway_v2(text,text,uuid,uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.create_independent_academic_pathway_v2(text,text,uuid,uuid,date,date,uuid) to service_role;
