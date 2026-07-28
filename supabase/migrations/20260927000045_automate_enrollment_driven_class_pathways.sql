-- Make learner enrollment_type drive class pathway setup automatically. The
-- first learner can initialise an empty class; established classes are locked
-- against mixed Regular, Virtual and Special populations.

create or replace function public.guard_portal_student_class_pathway()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_expected text; v_actual text; v_offering uuid; v_period uuid; v_other int:=0;
  v_class public.classes%rowtype; v_term public.academic_terms%rowtype;
begin
  if new.role<>'student' or new.class_id is null then return new; end if;
  v_actual:=public.canonical_academic_enrollment_type(new.enrollment_type);
  if v_actual is null then
    raise exception using message='Choose the learner enrollment type before assigning a class.';
  end if;
  new.enrollment_type:=v_actual;
  select * into v_class from public.classes where id=new.class_id for update;
  if v_class.id is null then return new; end if;

  if v_class.academic_offering_id is null then
    insert into public.academic_offerings(
      title,pathway,enrollment_type,programme_id,school_id,calendar_mode,result_destination,
      starts_on,ends_on,status,delivery_mode,settings
    ) values (
      v_class.name,
      case when v_actual='school' then 'school_term' when v_actual='online' then 'online_school' else 'short_course' end,
      v_actual,v_class.program_id,v_class.school_id,
      case when v_actual in ('school','online') then 'school_calendar' else 'fixed_dates' end,
      case when v_actual in ('school','online') then 'school_report' else 'standalone' end,
      v_class.start_date,v_class.end_date,'active',
      case when v_actual='school' then 'in_school' when v_actual='online' then 'virtual'
           when v_actual='in_person' then 'onsite' else 'hybrid' end,
      jsonb_build_object('source_class_id',v_class.id,'pathway_source','learner_enrollment_type')
    ) returning id into v_offering;
    if v_class.term_id is not null and v_actual in ('school','online') then
      select * into v_term from public.academic_terms where id=v_class.term_id;
      insert into public.academic_offering_periods(offering_id,label,starts_on,ends_on,status)
      values(v_offering,concat_ws(' ',v_term.term_label,v_term.academic_year),v_term.start_date,v_term.end_date,'active')
      returning id into v_period;
    else
      insert into public.academic_offering_periods(offering_id,label,starts_on,ends_on,status)
      values(v_offering,case when v_actual in ('school','online') then 'Academic period to be confirmed'
        else v_class.name||' programme period' end,v_class.start_date,v_class.end_date,'active')
      returning id into v_period;
    end if;
    update public.classes set academic_offering_id=v_offering,offering_period_id=v_period where id=v_class.id;
    v_expected:=v_actual;
  else
    select enrollment_type into v_expected from public.academic_offerings where id=v_class.academic_offering_id;
    select count(*) into v_other from public.portal_users u
    where u.role='student' and u.class_id=new.class_id and u.id<>new.id and coalesce(u.is_deleted,false)=false;
    if v_expected<>v_actual and v_other=0
      and not exists(select 1 from public.academic_assessment_evidence e where e.academic_offering_id=v_class.academic_offering_id)
      and not exists(select 1 from public.student_progress_reports r where r.academic_offering_id=v_class.academic_offering_id) then
      update public.academic_offerings set enrollment_type=v_actual,
        pathway=case when v_actual='school' then 'school_term' when v_actual='online' then 'online_school' else 'short_course' end,
        calendar_mode=case when v_actual in ('school','online') then 'school_calendar' else 'fixed_dates' end,
        delivery_mode=case when v_actual='school' then 'in_school' when v_actual='online' then 'virtual'
          when v_actual='in_person' then 'onsite' else 'hybrid' end,
        updated_at=now()
      where id=v_class.academic_offering_id;
      v_expected:=v_actual;
    end if;
  end if;
  if v_actual<>v_expected then
    raise exception using message='This class is for a different enrollment type.',
      detail=format('Learner enrollment is %s but the class is for %s.',v_actual,v_expected),
      hint='Choose a matching Regular School, Virtual School, or Special Programme class.';
  end if;
  return new;
end;
$$;

comment on function public.guard_portal_student_class_pathway() is
  'Uses the first learner enrollment_type to initialise an empty class pathway, then prevents cross-pathway learner and result bleed.';
