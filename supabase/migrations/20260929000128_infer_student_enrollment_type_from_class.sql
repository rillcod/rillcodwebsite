-- Automatically infer and align learner `enrollment_type` from the destination class
-- when adding, adopting, or checking in students (including Pass-Around Kiosk and
-- Unified Student Identity moves between Special Programmes and Regular School classes).

create or replace function public.canonical_academic_enrollment_type(p_value text)
returns text language sql immutable parallel safe as $$
  select case lower(trim(coalesce(p_value,'')))
    when 'school' then 'school'
    when 'school_term' then 'school'
    when 'partner_school' then 'school'
    when 'online' then 'online'
    when 'online_school' then 'online'
    when 'virtual' then 'online'
    when 'in_person' then 'in_person'
    when 'in-person' then 'in_person'
    when 'onsite' then 'in_person'
    when 'special' then 'special'
    when 'summer_school' then 'special'
    when 'summer' then 'special'
    when 'bootcamp' then 'special'
    when 'seasonal' then 'special'
    when 'holiday' then 'special'
    when 'independent' then 'special'
    when 'special_program' then 'special'
    when 'special_programme' then 'special'
    else null end
$$;

create or replace function public.guard_portal_student_class_pathway()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_expected text; v_actual text; v_offering uuid; v_period uuid; v_other int:=0;
  v_class public.classes%rowtype; v_term public.academic_terms%rowtype;
begin
  if new.role<>'student' or new.class_id is null then return new; end if;

  select * into v_class from public.classes where id=new.class_id for update;
  if v_class.id is null then return new; end if;

  v_actual:=public.canonical_academic_enrollment_type(new.enrollment_type);

  if v_class.academic_offering_id is not null then
    select enrollment_type into v_expected from public.academic_offerings where id=v_class.academic_offering_id;
  end if;

  -- When enrollment_type was omitted on intake/kiosk/quick-add, inherit from the class offering or school context.
  if v_actual is null then
    v_actual:=coalesce(
      v_expected,
      case when v_class.school_id is not null then 'school' else 'special' end
    );
  end if;
  new.enrollment_type:=v_actual;

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
    elsif v_expected is not null and v_actual<>v_expected and (tg_op='INSERT' or new.class_id is distinct from old.class_id) then
      -- Student is being adopted/enrolled into an established class: align learner enrollment_type to the class pathway.
      v_actual:=v_expected;
      new.enrollment_type:=v_expected;
    end if;
  end if;

  if v_expected is not null and v_actual<>v_expected then
    raise exception using message='This class is for a different enrollment type.',
      detail=format('Learner enrollment is %s but the class is for %s.',v_actual,v_expected),
      hint='Choose a matching Regular School, Virtual School, or Special Programme class.';
  end if;

  return new;
end;
$$;

-- Backfill any existing placed student profiles that have missing or non-canonical enrollment_type.
update public.portal_users u
set enrollment_type = coalesce(
  o.enrollment_type,
  public.canonical_academic_enrollment_type(u.enrollment_type),
  case when c.school_id is not null or u.school_id is not null then 'school' else 'special' end
)
from public.classes c
left join public.academic_offerings o on o.id = c.academic_offering_id
where u.role = 'student'
  and u.class_id = c.id
  and public.canonical_academic_enrollment_type(u.enrollment_type) is distinct from coalesce(
    o.enrollment_type,
    public.canonical_academic_enrollment_type(u.enrollment_type),
    case when c.school_id is not null or u.school_id is not null then 'school' else 'special' end
  );
