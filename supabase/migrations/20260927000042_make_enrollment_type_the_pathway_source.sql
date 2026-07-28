-- The learner's existing enrollment_type is the source of truth for which
-- academic world they belong to. Offerings provide delivery context; they do
-- not create a second, competing learner classification.

alter table public.academic_offerings
  add column if not exists enrollment_type text;

-- Prefer the single enrollment type already used by learners in the class.
-- If a historical class is mixed, retain the safest pathway-derived value and
-- expose it as an integrity issue below instead of silently choosing a learner.
with class_types as (
  select c.academic_offering_id,
    min(case
      when lower(coalesce(u.enrollment_type,'')) in ('school') then 'school'
      when lower(coalesce(u.enrollment_type,'')) in ('online','online_school') then 'online'
      when lower(coalesce(u.enrollment_type,'')) in ('special','summer_school','summer','bootcamp','seasonal','special_program','special_programme') then 'special'
      when lower(coalesce(u.enrollment_type,'')) in ('in_person','in-person') then 'in_person'
      else null end) as enrollment_type,
    count(distinct case
      when lower(coalesce(u.enrollment_type,'')) in ('school') then 'school'
      when lower(coalesce(u.enrollment_type,'')) in ('online','online_school') then 'online'
      when lower(coalesce(u.enrollment_type,'')) in ('special','summer_school','summer','bootcamp','seasonal','special_program','special_programme') then 'special'
      when lower(coalesce(u.enrollment_type,'')) in ('in_person','in-person') then 'in_person'
      else null end) as type_count
  from public.classes c
  left join public.portal_users u on u.class_id=c.id and u.role='student' and coalesce(u.is_deleted,false)=false
  where c.academic_offering_id is not null
  group by c.academic_offering_id
)
update public.academic_offerings o
set enrollment_type=case
  when o.special_program_page_id is not null then 'special'
  when ct.type_count=1 then ct.enrollment_type
  when o.pathway='school_term' then 'school'
  when o.pathway='online_school' then 'online'
  else 'special' end
from class_types ct
where ct.academic_offering_id=o.id and o.enrollment_type is null;

update public.academic_offerings
set enrollment_type=case
  when special_program_page_id is not null then 'special'
  when pathway='school_term' then 'school'
  when pathway='online_school' then 'online'
  else 'special' end
where enrollment_type is null;

alter table public.academic_offerings
  alter column enrollment_type set not null,
  add constraint academic_offering_enrollment_type_check
    check(enrollment_type in ('school','online','in_person','special'));

alter table public.academic_assessment_evidence
  add column if not exists enrollment_type_snapshot text;
alter table public.student_progress_reports
  add column if not exists enrollment_type_snapshot text;

create or replace function public.canonical_academic_enrollment_type(p_value text)
returns text language sql immutable parallel safe as $$
  select case lower(trim(coalesce(p_value,'')))
    when 'school' then 'school'
    when 'online' then 'online'
    when 'online_school' then 'online'
    when 'in_person' then 'in_person'
    when 'in-person' then 'in_person'
    when 'special' then 'special'
    when 'summer_school' then 'special'
    when 'summer' then 'special'
    when 'bootcamp' then 'special'
    when 'seasonal' then 'special'
    when 'special_program' then 'special'
    when 'special_programme' then 'special'
    else null end
$$;

create or replace function public.align_offering_with_enrollment_type()
returns trigger language plpgsql set search_path=public as $$
begin
  new.enrollment_type:=public.canonical_academic_enrollment_type(new.enrollment_type);
  if new.enrollment_type is null then
    raise exception using message='Choose who this academic pathway is for.',
      hint='Use Regular School, Virtual School, or Special Programme enrollment.';
  end if;
  if new.enrollment_type='school' then
    new.pathway:='school_term';
  elsif new.enrollment_type='online' then
    new.pathway:='online_school';
  elsif new.pathway in ('school_term','online_school') then
    new.pathway:='short_course';
  end if;
  return new;
end;
$$;

drop trigger if exists aa_align_offering_with_enrollment_type on public.academic_offerings;
create trigger aa_align_offering_with_enrollment_type
before insert or update of enrollment_type,pathway on public.academic_offerings
for each row execute function public.align_offering_with_enrollment_type();

create or replace function public.guard_student_academic_pathway()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_expected text; v_actual text;
begin
  if new.academic_offering_id is null or new.student_id is null then return new; end if;
  select enrollment_type into v_expected from public.academic_offerings where id=new.academic_offering_id;
  select public.canonical_academic_enrollment_type(enrollment_type) into v_actual
  from public.portal_users where id=new.student_id and role='student';
  if v_actual is null then
    raise exception using message='This learner has no recognised enrollment type.',
      hint='Set the learner enrollment type before recording academic evidence or preparing a result.';
  end if;
  if v_actual<>v_expected then
    raise exception using message='This learner belongs to a different academic pathway.',
      detail=format('Learner enrollment is %s but this class or programme accepts %s.',v_actual,v_expected),
      hint='Move the learner to the matching class/cohort; do not merge results across pathways.';
  end if;
  new.enrollment_type_snapshot:=v_actual;
  return new;
end;
$$;

drop trigger if exists guard_evidence_student_pathway on public.academic_assessment_evidence;
create trigger guard_evidence_student_pathway
before insert or update of student_id,academic_offering_id on public.academic_assessment_evidence
for each row execute function public.guard_student_academic_pathway();
drop trigger if exists guard_report_student_pathway on public.student_progress_reports;
create trigger guard_report_student_pathway
before insert or update of student_id,academic_offering_id on public.student_progress_reports
for each row execute function public.guard_student_academic_pathway();

-- Guard future learner placement. Existing historical mismatches remain visible
-- to the Academic Office and can be corrected deliberately.
create or replace function public.guard_portal_student_class_pathway()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_expected text; v_actual text;
begin
  if new.role<>'student' or new.class_id is null then return new; end if;
  select o.enrollment_type into v_expected
  from public.classes c join public.academic_offerings o on o.id=c.academic_offering_id
  where c.id=new.class_id;
  if v_expected is null then return new; end if;
  v_actual:=public.canonical_academic_enrollment_type(new.enrollment_type);
  if v_actual is null then
    raise exception using message='Choose the learner enrollment type before assigning a class.';
  end if;
  if v_actual<>v_expected then
    raise exception using message='This class is for a different enrollment type.',
      detail=format('Learner enrollment is %s but the class is for %s.',v_actual,v_expected),
      hint='Choose a matching Regular School, Virtual School, or Special Programme class.';
  end if;
  new.enrollment_type:=v_actual;
  return new;
end;
$$;

drop trigger if exists guard_portal_student_class_pathway on public.portal_users;
create trigger guard_portal_student_class_pathway
before insert or update of class_id,enrollment_type on public.portal_users
for each row execute function public.guard_portal_student_class_pathway();

create or replace view public.academic_enrollment_pathway_issues
with (security_invoker=true) as
select u.id as student_id,u.full_name,u.class_id,u.enrollment_type,
  o.id as academic_offering_id,o.title as offering_title,o.enrollment_type as expected_enrollment_type,
  case when public.canonical_academic_enrollment_type(u.enrollment_type) is null then 'Enrollment type is missing or unsupported.'
       else 'Learner enrollment does not match the class academic pathway.' end as issue
from public.portal_users u
join public.classes c on c.id=u.class_id
join public.academic_offerings o on o.id=c.academic_offering_id
where u.role='student' and coalesce(u.is_deleted,false)=false
  and public.canonical_academic_enrollment_type(u.enrollment_type) is distinct from o.enrollment_type;

revoke all on public.academic_enrollment_pathway_issues from anon,authenticated;
grant select on public.academic_enrollment_pathway_issues to service_role;
revoke all on function public.canonical_academic_enrollment_type(text) from public,anon,authenticated;
grant execute on function public.canonical_academic_enrollment_type(text) to service_role;

comment on column public.academic_offerings.enrollment_type is
  'Authoritative learner enrollment type accepted by this offering: school, online, in_person or special.';
comment on view public.academic_enrollment_pathway_issues is
  'Academic Office repair queue for learners whose existing enrollment type conflicts with their assigned class pathway.';
