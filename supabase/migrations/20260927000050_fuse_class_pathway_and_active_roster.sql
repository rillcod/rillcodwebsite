-- Final class-pathway fuse. Registration owns the learner classification;
-- classes bind to one compatible offering and one delivery period.


create or replace function public.ensure_class_academic_pathway(
  p_class_id uuid,
  p_enrollment_type text,
  p_preferred_offering_id uuid default null,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_class public.classes%rowtype;
  v_term public.academic_terms%rowtype;
  v_type text;
  v_offering public.academic_offerings%rowtype;
  v_period public.academic_offering_periods%rowtype;
  v_matches integer:=0;
begin
  select * into v_class from public.classes where id=p_class_id for update;
  if v_class.id is null then raise exception 'Class not found.'; end if;
  v_type:=public.canonical_academic_enrollment_type(p_enrollment_type);
  if v_type is null then raise exception 'Choose Regular School, Online School, In-person, or Special Programme.'; end if;

  if v_class.academic_offering_id is not null then
    select * into v_offering from public.academic_offerings where id=v_class.academic_offering_id;
    if v_offering.enrollment_type<>v_type then
      raise exception using message='This class is already connected to a different learning pathway.',
        hint='Create a separate class for the other enrollment type; do not mix pathways.';
    end if;
  elsif p_preferred_offering_id is not null then
    select * into v_offering from public.academic_offerings
    where id=p_preferred_offering_id and status='active';
    if v_offering.id is null then raise exception 'The selected academic pathway is not active.'; end if;
    if v_offering.enrollment_type<>v_type
      or v_offering.programme_id is distinct from v_class.program_id
      or (v_offering.school_id is not null and v_offering.school_id is distinct from v_class.school_id) then
      raise exception 'The selected academic pathway does not match this class, programme, school, or enrollment type.';
    end if;
  else
    select count(*) into v_matches from public.academic_offerings o
    where o.status='active' and o.enrollment_type=v_type
      and o.programme_id is not distinct from v_class.program_id
      and o.school_id is not distinct from v_class.school_id;
    if v_matches=1 then
      select * into v_offering from public.academic_offerings o
      where o.status='active' and o.enrollment_type=v_type
        and o.programme_id is not distinct from v_class.program_id
        and o.school_id is not distinct from v_class.school_id limit 1;
    elsif v_matches>1 and v_type<>'school' then
      raise exception using message='Choose the exact Online or Special pathway for this class.',
        hint='More than one compatible pathway exists; selecting one prevents curriculum and result bleed.';
    end if;
  end if;

  if v_offering.id is null then
    insert into public.academic_offerings(
      title,pathway,enrollment_type,programme_id,school_id,calendar_mode,result_destination,
      starts_on,ends_on,status,delivery_mode,created_by,settings
    ) values(
      v_class.name,
      case when v_type='school' then 'school_term' when v_type='online' then 'online_school' else 'short_course' end,
      v_type,v_class.program_id,v_class.school_id,
      case when v_type in ('school','online') then 'school_calendar' else 'fixed_dates' end,
      case when v_type in ('school','online') then 'school_report' else 'standalone' end,
      v_class.start_date,v_class.end_date,'active',
      case when v_type='school' then 'in_school' when v_type='online' then 'virtual'
           when v_type='in_person' then 'onsite' else 'hybrid' end,
      p_actor_id,jsonb_build_object('source','class_setup','source_class_id',v_class.id)
    ) returning * into v_offering;
  end if;

  if v_class.term_id is not null then select * into v_term from public.academic_terms where id=v_class.term_id; end if;
  select * into v_period from public.academic_offering_periods p
  where p.offering_id=v_offering.id and p.status='active'
    and ((v_term.id is not null and p.starts_on is not distinct from v_term.start_date and p.ends_on is not distinct from v_term.end_date)
      or (v_term.id is null and p.starts_on is not distinct from v_class.start_date and p.ends_on is not distinct from v_class.end_date))
  order by p.sequence_number nulls last,p.created_at limit 1;
  if v_period.id is null then
    insert into public.academic_offering_periods(offering_id,label,sequence_number,starts_on,ends_on,status)
    values(v_offering.id,
      case when v_term.id is not null then concat_ws(' ',v_term.term_label,v_term.academic_year)
           else v_class.name||' programme period' end,
      coalesce(v_term.term_number,1),coalesce(v_term.start_date,v_class.start_date),coalesce(v_term.end_date,v_class.end_date),'active')
    returning * into v_period;
  end if;
  update public.classes set academic_offering_id=v_offering.id,offering_period_id=v_period.id,updated_at=now()
  where id=v_class.id;
  return jsonb_build_object('academic_offering_id',v_offering.id,'offering_period_id',v_period.id,'enrollment_type',v_type);
end;
$$;

revoke all on function public.ensure_class_academic_pathway(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ensure_class_academic_pathway(uuid,text,uuid,uuid) to service_role;

create or replace function public.active_class_student_count(p_class_id uuid)
returns bigint language sql stable security definer set search_path=public as $$
  with target as (select id,term_id from public.classes where id=p_class_id),
  rostered as (
    select distinct r.student_id
    from public.class_term_rosters r
    join public.portal_users u on u.id=r.student_id and u.role='student' and coalesce(u.is_deleted,false)=false
    cross join target t
    where r.class_id=t.id and r.term_id is not distinct from t.term_id and r.status='active'
  ), legacy as (
    select u.id from public.portal_users u,target t
    where u.class_id=t.id and u.role='student' and coalesce(u.is_deleted,false)=false and coalesce(u.is_active,true)
      and not exists(select 1 from public.class_term_rosters r where r.class_id=t.id and r.student_id=u.id and r.term_id is not distinct from t.term_id)
  ) select count(*) from (select student_id as id from rostered union select id from legacy) x
$$;
revoke all on function public.active_class_student_count(uuid) from public,anon,authenticated;
grant execute on function public.active_class_student_count(uuid) to service_role;

comment on function public.ensure_class_academic_pathway(uuid,text,uuid,uuid) is
  'Atomically binds a class to one enrollment-compatible offering and delivery period.';
comment on function public.active_class_student_count(uuid) is
  'Counts active current-term roster members while retaining unrostered legacy class members.';
