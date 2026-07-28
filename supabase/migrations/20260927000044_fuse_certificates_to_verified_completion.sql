-- Certificates are available to every academic pathway. They come from the
-- same moderated result and QA trail as every other academic outcome, not
-- from an isolated lesson, CBT or assignment side effect.

alter table public.academic_offerings
  add column if not exists awards_certificate boolean;
update public.academic_offerings
set awards_certificate=true
where awards_certificate is null;
alter table public.academic_offerings alter column awards_certificate set default true;
alter table public.academic_offerings alter column awards_certificate set not null;

alter table public.certificates
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete restrict,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete restrict,
  add column if not exists progress_report_id uuid references public.student_progress_reports(id) on delete restrict,
  add column if not exists completion_status text default 'issued',
  add column if not exists eligibility_snapshot jsonb not null default '{}'::jsonb;

alter table public.certificates
  add constraint certificate_completion_status_check
    check(completion_status in ('pending','issued','revoked'));

-- A learner may complete the same course in different cohorts. Historical
-- certificates with no offering retain their old uniqueness behaviour.
alter table public.certificates drop constraint if exists uq_certificates_user_course;
create unique index if not exists certificates_learner_course_offering_unique
  on public.certificates(portal_user_id,course_id,academic_offering_id)
  where academic_offering_id is not null and completion_status<>'revoked';
create unique index if not exists certificates_legacy_learner_course_unique
  on public.certificates(portal_user_id,course_id)
  where academic_offering_id is null and completion_status<>'revoked';

-- Retire the old fragmented auto-issuance. Those triggers could issue from one
-- lesson, CBT or assignment event without the complete moderated result trail.
drop trigger if exists tr_check_cert_assignment_submissions on public.assignment_submissions;
drop trigger if exists tr_check_cert_cbt_sessions on public.cbt_sessions;
drop trigger if exists tr_check_cert_lesson_progress on public.lesson_progress;

create or replace function public.issue_verified_academic_certificate(
  p_student_id uuid,
  p_course_id uuid,
  p_actor_id uuid default null,
  p_class_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r public.student_progress_reports%rowtype;
  o public.academic_offerings%rowtype;
  cert public.certificates%rowtype;
  pass_mark numeric;
begin
  select pr.* into r
  from public.student_progress_reports pr
  join public.academic_offerings ao on ao.id=pr.academic_offering_id
  where pr.student_id=p_student_id and pr.course_id=p_course_id
    and (p_class_id is null or pr.class_id=p_class_id)
    and pr.is_published=true and pr.academic_qa_status='ready'
    and ao.awards_certificate=true
  order by pr.report_date desc nulls last,pr.updated_at desc
  limit 1 for update of pr;

  if r.id is null then
    raise exception using message='This learner is not yet eligible for a certificate.',
      hint='Publish a QA-ready term or completion result for the learner first.';
  end if;
  select * into o from public.academic_offerings where id=r.academic_offering_id;
  pass_mark:=coalesce(nullif(o.settings->>'certificate_pass_score','')::numeric,50);
  if r.overall_score is null or r.overall_score<pass_mark then
    raise exception using message='The verified result does not meet the certificate pass mark.',
      detail=format('Verified score is %s; this programme requires %s.',coalesce(r.overall_score,0),pass_mark);
  end if;

  select * into cert from public.certificates
  where portal_user_id=p_student_id and course_id=p_course_id
    and academic_offering_id=r.academic_offering_id and completion_status<>'revoked'
  limit 1;
  if cert.id is not null then
    return jsonb_build_object('id',cert.id,'already_issued',true,'academic_offering_id',r.academic_offering_id);
  end if;

  insert into public.certificates(
    portal_user_id,course_id,certificate_number,verification_code,issued_date,
    academic_offering_id,offering_period_id,progress_report_id,completion_status,
    eligibility_snapshot,metadata
  ) values (
    p_student_id,p_course_id,
    'RC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),current_date,
    r.academic_offering_id,r.offering_period_id,r.id,'issued',
    jsonb_build_object('qa_status',r.academic_qa_status,'overall_score',r.overall_score,
      'pass_mark',pass_mark,'curriculum_release_id',r.curriculum_release_id,
      'calculation_mode',r.calculation_mode,'issued_by',p_actor_id,'issued_at',now()),
    jsonb_build_object('is_published',true,'status','issued','pdf_status','pending',
      'issued_by',p_actor_id,'school_id',r.school_id,'academic_offering_id',r.academic_offering_id,
      'offering_period_id',r.offering_period_id,'progress_report_id',r.id)
  ) returning * into cert;
  return jsonb_build_object('id',cert.id,'already_issued',false,
    'academic_offering_id',r.academic_offering_id,'progress_report_id',r.id);
end;
$$;

create or replace function public.auto_issue_verified_academic_certificate()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_awards boolean;
begin
  if new.is_published=true and new.academic_qa_status='ready'
    and (tg_op='INSERT' or old.is_published is distinct from true or old.academic_qa_status is distinct from 'ready') then
    select awards_certificate into v_awards
    from public.academic_offerings where id=new.academic_offering_id;
    if v_awards then
      perform public.issue_verified_academic_certificate(new.student_id,new.course_id,new.teacher_id,new.class_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists auto_issue_verified_academic_certificate on public.student_progress_reports;
create trigger auto_issue_verified_academic_certificate
after insert or update of is_published,academic_qa_status on public.student_progress_reports
for each row execute function public.auto_issue_verified_academic_certificate();

create or replace function public.guard_verified_certificate_context()
returns trigger language plpgsql set search_path=public as $$
declare r public.student_progress_reports%rowtype;
begin
  -- Existing certificates remain valid. Every new academic certificate must
  -- point to the result that proved completion.
  if new.progress_report_id is null then
    raise exception using message='A verified completion result is required before issuing a certificate.',
      hint='Use the Academic Spine certificate action; legacy direct issuance is no longer accepted.';
  end if;
  select * into r from public.student_progress_reports where id=new.progress_report_id;
  if r.id is null or r.student_id is distinct from new.portal_user_id or r.course_id is distinct from new.course_id
    or r.academic_offering_id is distinct from new.academic_offering_id
    or r.offering_period_id is distinct from new.offering_period_id
    or r.academic_qa_status<>'ready' or r.is_published<>true then
    raise exception using message='Certificate context does not match a published, QA-ready result.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_verified_certificate_context on public.certificates;
create trigger guard_verified_certificate_context
before insert or update of portal_user_id,course_id,academic_offering_id,offering_period_id,progress_report_id
on public.certificates for each row execute function public.guard_verified_certificate_context();

revoke all on function public.issue_verified_academic_certificate(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.issue_verified_academic_certificate(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.auto_issue_verified_academic_certificate() from public,anon,authenticated;

create index if not exists certificates_offering_result_idx
  on public.certificates(academic_offering_id,offering_period_id,progress_report_id);

comment on function public.issue_verified_academic_certificate(uuid,uuid,uuid,uuid) is
  'Issues an offering-scoped certificate only from a published, QA-ready, passing result in any academic pathway.';
