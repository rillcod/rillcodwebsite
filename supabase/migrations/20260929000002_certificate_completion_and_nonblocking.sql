-- Two faults in certificate auto-issuance.
--
-- 1. Publishing a report ran issue_verified_academic_certificate from an AFTER
--    trigger, and that function raised when the learner was below the pass
--    mark. An exception in the trigger aborts the statement, so a teacher
--    could not publish a result for a learner who failed. Eligibility is a
--    normal outcome, not an error, and must never cancel publication.
--
-- 2. Eligibility asked only for a published, QA-ready, passing report. The
--    first passing term therefore earned a full course certificate. It now
--    also asks whether the programme is actually complete, governed per
--    offering by settings->>'certificate_completion_basis':
--      final_period (default) — the report's period must be the last one
--      any_period             — previous behaviour, any passing period
--    Offerings with no periods defined fall back to any_period, since there
--    is nothing to complete.

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
  completion_basis text;
  final_sequence integer;
  report_sequence integer;
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
    return jsonb_build_object('status','not_eligible',
      'reason','No published, QA-ready result exists for this learner yet.');
  end if;

  select * into o from public.academic_offerings where id=r.academic_offering_id;
  pass_mark:=coalesce(nullif(o.settings->>'certificate_pass_score','')::numeric,50);

  if r.overall_score is null or r.overall_score<pass_mark then
    return jsonb_build_object('status','pass_mark_not_met',
      'reason',format('Verified score is %s; this programme requires %s.',
        coalesce(r.overall_score,0),pass_mark),
      'overall_score',r.overall_score,'pass_mark',pass_mark);
  end if;

  -- Has the learner finished the programme, or only one period of it?
  completion_basis:=coalesce(nullif(o.settings->>'certificate_completion_basis',''),'final_period');
  select max(sequence_number) into final_sequence
  from public.academic_offering_periods
  where offering_id=r.academic_offering_id and status<>'archived';

  if completion_basis='final_period' and final_sequence is not null then
    select sequence_number into report_sequence
    from public.academic_offering_periods where id=r.offering_period_id;
    if report_sequence is null or report_sequence<final_sequence then
      return jsonb_build_object('status','completion_not_met',
        'reason','The programme is not finished yet, so a completion certificate is not due.',
        'completed_period',report_sequence,'final_period',final_sequence);
    end if;
  end if;

  select * into cert from public.certificates
  where portal_user_id=p_student_id and course_id=p_course_id
    and academic_offering_id=r.academic_offering_id and completion_status<>'revoked'
  limit 1;
  if cert.id is not null then
    return jsonb_build_object('status','already_issued','id',cert.id,'already_issued',true,
      'academic_offering_id',r.academic_offering_id);
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
      'calculation_mode',r.calculation_mode,'completion_basis',completion_basis,
      'completed_period',report_sequence,'final_period',final_sequence,
      'issued_by',p_actor_id,'issued_at',now()),
    jsonb_build_object('is_published',true,'status','issued','pdf_status','pending',
      'issued_by',p_actor_id,'school_id',r.school_id,'academic_offering_id',r.academic_offering_id,
      'offering_period_id',r.offering_period_id,'progress_report_id',r.id)
  ) returning * into cert;

  return jsonb_build_object('status','issued','id',cert.id,'already_issued',false,
    'academic_offering_id',r.academic_offering_id);
end;
$$;

-- The trigger records the outcome and never lets it abort publication.
create or replace function public.auto_issue_verified_academic_certificate()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_awards boolean;
  v_outcome jsonb;
begin
  if new.is_published=true and new.academic_qa_status='ready'
    and (tg_op='INSERT' or old.is_published is distinct from true or old.academic_qa_status is distinct from 'ready') then
    select awards_certificate into v_awards
    from public.academic_offerings where id=new.academic_offering_id;
    if v_awards then
      begin
        v_outcome:=public.issue_verified_academic_certificate(
          new.student_id,new.course_id,new.teacher_id,new.class_id);
      exception when others then
        -- Publication is the teacher's action; a certificate problem is ours.
        v_outcome:=jsonb_build_object('status','error','reason',sqlerrm);
      end;
      update public.student_progress_reports
      set calculation_snapshot=coalesce(calculation_snapshot,'{}'::jsonb)
        ||jsonb_build_object('certificate',v_outcome||jsonb_build_object('checked_at',now()))
      where id=new.id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.issue_verified_academic_certificate(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.issue_verified_academic_certificate(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.auto_issue_verified_academic_certificate() from public,anon,authenticated;

comment on function public.issue_verified_academic_certificate(uuid,uuid,uuid,uuid) is
  'Returns an eligibility outcome (issued, already_issued, not_eligible, pass_mark_not_met, completion_not_met) and never raises for ineligibility, so publishing a result cannot be blocked by a learner failing.';
