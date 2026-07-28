-- Smart unified calculation for both school terms and special/online offering
-- periods. The context predicate always includes the isolated offering.

create or replace function public.recalculate_academic_result(p_report_id uuid,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r public.student_progress_reports%rowtype;
  scheme public.academic_assessment_schemes%rowtype;
  k text; lbl text; raw numeric; wt numeric; weighted numeric; n int; ids uuid[];
  total numeric:=0; missing jsonb:='[]'::jsonb;
  n_sessions int:=0; n_present int:=0; attendance_ids uuid[]:='{}';
  keys text[]:=array['theory','classwork','practical','assignments','attendance','assessment'];
  labels text[]:=array['Theory / examination','Classwork','Practical / project','Assignments','Attendance','Mid-term assessment'];
begin
  select * into r from public.student_progress_reports where id=p_report_id for update;
  if r.id is null then raise exception 'Progress report not found.'; end if;
  if r.calculation_mode='manual' then
    raise exception using message='This is a manually entered result and will not be overwritten.',
      hint='Choose Automatic only when the system should calculate from recorded evidence.';
  end if;
  if r.class_id is null or r.course_id is null or r.curriculum_release_id is null
     or r.academic_offering_id is null or r.offering_period_id is null then
    raise exception using message='The result is missing its academic offering context.',
      hint='Attach the learner to a regular school, online school, bootcamp or short-course class first.';
  end if;

  select * into scheme from public.academic_assessment_schemes s
  where s.status='active'
    and (s.academic_offering_id is null or s.academic_offering_id=r.academic_offering_id)
    and (s.school_id is null or s.school_id=r.school_id)
    and (s.course_id is null or s.course_id=r.course_id)
    and (s.academic_term_id is null or s.academic_term_id=r.term_id)
  order by (s.academic_offering_id is not null)::int*8+(s.school_id is not null)::int*4+
    (s.course_id is not null)::int*2+(s.academic_term_id is not null)::int desc
  limit 1;
  if scheme.id is null then raise exception 'No active assessment weighting scheme is available.'; end if;

  delete from public.academic_result_components where progress_report_id=r.id;
  for i in 1..array_length(keys,1) loop
    k:=keys[i]; lbl:=labels[i]; wt:=(scheme.components->>k)::numeric;
    raw:=null; n:=0; ids:='{}';
    if k='theory' then
      select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into raw,n,ids
      from public.academic_assessment_evidence e join public.cbt_exams x on x.id=e.assessment_id
      where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
        and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id and e.course_id=r.course_id
        and e.evidence_status in ('graded','moderated')
        and coalesce(x.metadata->>'exam_type','examination')<>'evaluation';
    elsif k='assessment' then
      select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into raw,n,ids
      from public.academic_assessment_evidence e join public.cbt_exams x on x.id=e.assessment_id
      where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
        and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id and e.course_id=r.course_id
        and e.evidence_status in ('graded','moderated') and x.metadata->>'exam_type'='evaluation';
    elsif k='classwork' then
      select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into raw,n,ids
      from public.academic_assessment_evidence e join public.assignments a on a.id=e.assessment_id
      where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
        and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id and e.course_id=r.course_id
        and e.evidence_status in ('graded','moderated') and lower(coalesce(a.assignment_type,'')) in ('classwork','homework');
    elsif k='assignments' then
      select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into raw,n,ids
      from public.academic_assessment_evidence e join public.assignments a on a.id=e.assessment_id
      where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
        and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id and e.course_id=r.course_id
        and e.evidence_status in ('graded','moderated')
        and lower(coalesce(a.assignment_type,'assignment')) not in ('classwork','homework','project','practical');
    elsif k='practical' then
      select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into raw,n,ids
      from public.academic_assessment_evidence e left join public.assignments a
        on a.id=e.assessment_id and e.evidence_type='assignment_submission'
      where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
        and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id and e.course_id=r.course_id
        and e.evidence_status in ('graded','moderated')
        and (e.evidence_type='weekly_practical' or lower(coalesce(a.assignment_type,'')) in ('project','practical'));
    elsif k='attendance' then
      select count(*) into n_sessions from public.class_sessions s
      where s.class_id=r.class_id and (r.term_id is null or s.term_id=r.term_id);
      if n_sessions>0 then
        select count(*),coalesce(array_agg(a.id),'{}') into n_present,attendance_ids
        from public.attendance a join public.class_sessions s on s.id=a.session_id
        where a.user_id=r.student_id and s.class_id=r.class_id
          and (r.term_id is null or s.term_id=r.term_id) and a.status='present';
        raw:=round((n_present::numeric/n_sessions::numeric)*100,2);n:=n_present;ids:=attendance_ids;
      end if;
    end if;
    weighted:=round(coalesce(raw,0)*wt/100,2); total:=total+weighted;
    if raw is null then missing:=missing||jsonb_build_array(k); end if;
    insert into public.academic_result_components(progress_report_id,component_key,component_label,
      weight,raw_score,weighted_score,evidence_count,evidence_ids,source_summary,evidence_missing)
    values(r.id,k,lbl,wt,raw,weighted,n,ids,
      case when k='attendance' then jsonb_build_object('held_sessions',n_sessions,'present_sessions',n_present) else '{}'::jsonb end,
      raw is null);
  end loop;

  update public.student_progress_reports set
    theory_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='theory'),0),
    practical_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='practical'),0),
    attendance_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='assignments'),0),
    participation_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='attendance'),0),
    overall_score=round(total,2),calculated_at=now(),
    calculation_snapshot=jsonb_build_object('scheme_id',scheme.id,'scheme_name',scheme.name,
      'weights',scheme.components,'calculated_by',p_actor_id,'academic_offering_id',r.academic_offering_id,
      'offering_period_id',r.offering_period_id,'missing_components',missing)
  where id=r.id;
  return jsonb_build_object('overall_score',round(total,2),'scheme',scheme.name,
    'pathway',(select pathway from public.academic_offerings where id=r.academic_offering_id),
    'missing_components',missing);
end;
$$;

revoke all on function public.recalculate_academic_result(uuid,uuid) from public,authenticated;
grant execute on function public.recalculate_academic_result(uuid,uuid) to service_role;

create or replace function public.evaluate_progress_report_academic_qa(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.student_progress_reports%rowtype; n int:=0; linked int:=0; planned int:=0; delivered int:=0;
  missing jsonb:='[]'::jsonb; issues jsonb:='[]'::jsonb; state text:='ready';
begin
  select * into r from public.student_progress_reports where id=p_report_id;
  if r.id is null then raise exception 'Progress report not found.'; end if;
  select count(*),count(*) filter(where lesson_plan_id is not null and curriculum_release_id is not null)
    into n,linked from public.academic_assessment_evidence e
  where e.student_id=r.student_id and e.class_id=r.class_id and e.course_id=r.course_id
    and e.academic_offering_id=r.academic_offering_id and e.offering_period_id=r.offering_period_id
    and e.evidence_type<>'term_grade' and e.evidence_status in ('graded','moderated');
  select count(*),count(*) filter(where status='delivered') into planned,delivered
  from public.class_lesson_delivery where class_id=r.class_id and course_id=r.course_id
    and (r.term_id is null or academic_term_id=r.term_id);
  select coalesce(jsonb_agg(component_key),'[]'::jsonb) into missing
  from public.academic_result_components where progress_report_id=r.id and evidence_missing;
  if n=0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','no_assessment_evidence','message','No graded learning evidence is recorded for this offering period.'));state:='blocked'; end if;
  if r.curriculum_release_id is null then issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_official_direction','message','Attach the official curriculum edition used for this class.'));state:='blocked'; end if;
  if r.academic_offering_id is null or r.offering_period_id is null then issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_offering_context','message','Choose whether this is regular school, online school, bootcamp, holiday programme or short course.'));state:='blocked'; end if;
  if linked<n and state<>'blocked' then issues:=issues||jsonb_build_array(jsonb_build_object('code','partly_linked_evidence','message','Some marks are not linked to the official teaching plan.'));state:='needs_attention'; end if;
  if r.calculation_mode='automatic' and jsonb_array_length(missing)>0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_result_components','message','Automatic result evidence is incomplete.','components',missing));state:='blocked'; end if;
  update public.student_progress_reports set evidence_manifest=jsonb_build_object('evidence_count',n,
    'officially_linked_count',linked,'planned_delivery_records',planned,'delivered_records',delivered,
    'academic_offering_id',r.academic_offering_id,'offering_period_id',r.offering_period_id),
    academic_qa_status=state,academic_qa_issues=issues,academic_qa_checked_at=now(),
    curriculum_coverage=case when n=0 then 0 else round(linked::numeric/n::numeric*100,2) end,
    teaching_delivery_pct=case when planned=0 then null else round(delivered::numeric/planned::numeric*100,2) end
  where id=r.id;
  return jsonb_build_object('status',state,'issues',issues,'evidence_count',n,
    'officially_linked_count',linked,'missing_components',missing);
end;
$$;
revoke execute on function public.evaluate_progress_report_academic_qa(uuid) from authenticated;
grant execute on function public.evaluate_progress_report_academic_qa(uuid) to service_role;

create or replace function public.bind_evidence_to_academic_offering()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_offering uuid;v_period uuid;
begin
  if new.class_id is not null then
    select academic_offering_id,offering_period_id into v_offering,v_period from public.classes where id=new.class_id;
    new.academic_offering_id:=coalesce(new.academic_offering_id,v_offering);
    new.offering_period_id:=coalesce(new.offering_period_id,v_period);
  end if;
  return new;
end;
$$;

comment on function public.recalculate_academic_result(uuid,uuid) is
  'Smart single results engine for regular school, online school, bootcamp, holiday programme and short-course offering periods.';
