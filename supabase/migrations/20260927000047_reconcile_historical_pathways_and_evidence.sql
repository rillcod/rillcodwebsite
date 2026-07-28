-- Reconcile the two identifiable historical cohort cases found by the live
-- post-migration audit. No learner with assessment evidence is moved.

update public.academic_offerings o set
  enrollment_type='special',pathway='holiday_programme',calendar_mode='fixed_dates',
  result_destination='standalone',delivery_mode='hybrid',updated_at=now()
where lower(o.title)='summer school 2026'
  and not exists(select 1 from public.academic_assessment_evidence e where e.academic_offering_id=o.id);

update public.portal_users u set enrollment_type='special',updated_at=now()
from public.classes c join public.academic_offerings o on o.id=c.academic_offering_id
where u.class_id=c.id and u.role='student' and coalesce(u.is_deleted,false)=false
  and lower(o.title)='summer school 2026' and o.enrollment_type='special'
  and not exists(select 1 from public.academic_assessment_evidence e where e.class_id=c.id);

update public.academic_offerings o set
  pathway='short_course',calendar_mode='fixed_dates',result_destination='standalone',
  delivery_mode=case when o.enrollment_type='in_person' then 'onsite' else 'hybrid' end,
  starts_on=coalesce(o.starts_on,c.start_date),ends_on=coalesce(o.ends_on,c.end_date),updated_at=now()
from public.classes c where c.academic_offering_id=o.id
  and o.enrollment_type in ('special','in_person') and o.pathway in ('school_term','online_school');

update public.academic_offering_periods p set
  label=o.title||' programme period',starts_on=coalesce(p.starts_on,o.starts_on),
  ends_on=coalesce(p.ends_on,o.ends_on),updated_at=now()
from public.academic_offerings o where o.id=p.offering_id and o.academic_model='duration_programme';

alter table public.academic_assessment_evidence
  add column if not exists context_status text not null default 'traceable'
  check(context_status in ('traceable','legacy_unscoped'));

update public.academic_assessment_evidence set context_status='legacy_unscoped'
where class_id is null or academic_offering_id is null or offering_period_id is null;

create or replace function public.classify_academic_evidence_context()
returns trigger language plpgsql set search_path=public as $$
begin
  new.context_status:=case when new.class_id is not null and new.academic_offering_id is not null
    and new.offering_period_id is not null then 'traceable' else 'legacy_unscoped' end;
  return new;
end;
$$;
drop trigger if exists zz_classify_academic_evidence_context on public.academic_assessment_evidence;
create trigger zz_classify_academic_evidence_context
before insert or update of class_id,academic_offering_id,offering_period_id
on public.academic_assessment_evidence for each row execute function public.classify_academic_evidence_context();

create index if not exists academic_evidence_context_status_idx
  on public.academic_assessment_evidence(context_status,evidence_type,created_at desc);

comment on column public.academic_assessment_evidence.context_status is
  'traceable when class, offering and period are known; legacy_unscoped preserves older evidence honestly without guessing its cohort.';
