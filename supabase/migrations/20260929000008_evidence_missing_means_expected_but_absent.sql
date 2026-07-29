-- guard_automatic_result_evidence refuses to publish an automatic result while
-- any component is flagged evidence_missing. That flag was being set for
-- components the class is never assessed on at all, so a school that does not
-- run classwork or CBT evaluations could never publish an automatic result —
-- the end-to-end check hit exactly this on both the school and special
-- pathways.
--
-- evidence_missing now means what the guard assumes: this component was
-- expected and nothing was recorded. A component that is not part of the
-- class's assessment at all is not missing evidence, it simply does not apply,
-- and the snapshot already lists those separately as not_assessed_components.

create or replace function public.recalculate_academic_result(p_report_id uuid,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r public.student_progress_reports%rowtype;
  scheme public.academic_assessment_schemes%rowtype;
  k text; lbl text; raw numeric; wt numeric; weighted numeric; n int; ids uuid[];
  earned numeric:=0; applied_weight numeric:=0;
  missing jsonb:='[]'::jsonb; not_assessed jsonb:='[]'::jsonb;
  n_sessions int:=0; n_present int:=0; n_excused int:=0; n_counted int:=0;
  attendance_ids uuid[]:='{}';
  available boolean;
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
    k:=keys[i]; lbl:=labels[i]; wt:=coalesce((scheme.components->>k)::numeric,0);
    raw:=null; n:=0; ids:='{}'; available:=false;

    if k='theory' then
      select exists(select 1 from public.cbt_exams x
        where x.course_id=r.course_id
          and coalesce(x.metadata->>'exam_type','examination')<>'evaluation') into available;
      select sum(e.percentage*w)/nullif(sum(w),0),count(*),coalesce(array_agg(e.id),'{}')
        into raw,n,ids
      from (
        select e.*,coalesce(nullif(x.metadata->>'weight','')::numeric,1) as w
        from public.academic_assessment_evidence e
        join public.cbt_exams x on x.id=e.assessment_id
        where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
          and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id
          and e.course_id=r.course_id and e.evidence_status in ('graded','moderated')
          and coalesce(x.metadata->>'exam_type','examination')<>'evaluation'
      ) e;

    elsif k='assessment' then
      select exists(select 1 from public.cbt_exams x
        where x.course_id=r.course_id and x.metadata->>'exam_type'='evaluation') into available;
      select sum(e.percentage*w)/nullif(sum(w),0),count(*),coalesce(array_agg(e.id),'{}')
        into raw,n,ids
      from (
        select e.*,coalesce(nullif(x.metadata->>'weight','')::numeric,1) as w
        from public.academic_assessment_evidence e
        join public.cbt_exams x on x.id=e.assessment_id
        where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
          and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id
          and e.course_id=r.course_id and e.evidence_status in ('graded','moderated')
          and x.metadata->>'exam_type'='evaluation'
      ) e;

    elsif k='classwork' then
      select exists(select 1 from public.assignments a
        where a.course_id=r.course_id and lower(coalesce(a.assignment_type,''))='classwork') into available;
      select sum(e.percentage*w)/nullif(sum(w),0),count(*),coalesce(array_agg(e.id),'{}')
        into raw,n,ids
      from (
        select e.*,coalesce(nullif(a.metadata->>'weight','')::numeric,1) as w
        from public.academic_assessment_evidence e
        join public.assignments a on a.id=e.assessment_id
        where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
          and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id
          and e.course_id=r.course_id and e.evidence_status in ('graded','moderated')
          and lower(coalesce(a.assignment_type,''))='classwork'
      ) e;

    elsif k='assignments' then
      select exists(select 1 from public.assignments a
        where a.course_id=r.course_id
          and lower(coalesce(a.assignment_type,'assignment'))
              not in ('classwork','project','practical')) into available;
      select sum(e.percentage*w)/nullif(sum(w),0),count(*),coalesce(array_agg(e.id),'{}')
        into raw,n,ids
      from (
        select e.*,coalesce(nullif(a.metadata->>'weight','')::numeric,1) as w
        from public.academic_assessment_evidence e
        join public.assignments a on a.id=e.assessment_id
        where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
          and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id
          and e.course_id=r.course_id and e.evidence_status in ('graded','moderated')
          and lower(coalesce(a.assignment_type,'assignment'))
              not in ('classwork','project','practical')
      ) e;

    elsif k='practical' then
      select exists(select 1 from public.assignments a
        where a.course_id=r.course_id
          and lower(coalesce(a.assignment_type,'')) in ('project','practical')) into available;
      select sum(e.percentage*w)/nullif(sum(w),0),count(*),coalesce(array_agg(e.id),'{}')
        into raw,n,ids
      from (
        select e.*,coalesce(nullif(a.metadata->>'weight','')::numeric,1) as w
        from public.academic_assessment_evidence e
        left join public.assignments a
          on a.id=e.assessment_id and e.evidence_type='assignment_submission'
        where e.student_id=r.student_id and e.academic_offering_id=r.academic_offering_id
          and e.offering_period_id=r.offering_period_id and e.class_id=r.class_id
          and e.course_id=r.course_id and e.evidence_status in ('graded','moderated')
          and (e.evidence_type='weekly_practical'
               or lower(coalesce(a.assignment_type,'')) in ('project','practical'))
      ) e;
      if not available then
        select exists(select 1 from public.academic_assessment_evidence e
          where e.class_id=r.class_id and e.course_id=r.course_id
            and e.evidence_type='weekly_practical') into available;
      end if;

    elsif k='attendance' then
      select count(*) into n_sessions from public.class_sessions s
      where s.class_id=r.class_id and (r.term_id is null or s.term_id=r.term_id);
      available:=n_sessions>0;
      if n_sessions>0 then
        select
          count(*) filter (where a.status in ('present','late')),
          count(*) filter (where a.status='excused'),
          coalesce(array_agg(a.id) filter (where a.status in ('present','late')),'{}')
          into n_present,n_excused,attendance_ids
        from public.attendance a join public.class_sessions s on s.id=a.session_id
        where a.user_id=r.student_id and s.class_id=r.class_id
          and (r.term_id is null or s.term_id=r.term_id);
        n_counted:=greatest(n_sessions-n_excused,0);
        raw:=case when n_counted>0
          then round((n_present::numeric/n_counted::numeric)*100,2) else 0 end;
        n:=n_present;ids:=attendance_ids;
        if n_counted=0 then available:=false; end if;
      end if;
    end if;

    if not available or wt=0 then
      if wt>0 then not_assessed:=not_assessed||jsonb_build_array(k); end if;
    else
      raw:=coalesce(raw,0);
      earned:=earned+raw*wt;
      applied_weight:=applied_weight+wt;
      if n=0 then missing:=missing||jsonb_build_array(k); end if;
    end if;

    weighted:=round(coalesce(raw,0)*wt/100,2);
    insert into public.academic_result_components(progress_report_id,component_key,component_label,
      weight,raw_score,weighted_score,evidence_count,evidence_ids,source_summary,evidence_missing)
    values(r.id,k,lbl,wt,raw,weighted,n,ids,
      case when k='attendance' then jsonb_build_object(
             'held_sessions',n_sessions,'present_sessions',n_present,
             'excused_sessions',n_excused,'counted_sessions',n_counted)
           else jsonb_build_object('assessed',available) end,
      -- Expected but absent. A component the class is not assessed on is not
      -- missing evidence, and must not block publication.
      available and wt>0 and n=0);
  end loop;

  update public.student_progress_reports set
    theory_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='theory'),0),
    practical_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='practical'),0),
    attendance_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='assignments'),0),
    participation_score=coalesce((select raw_score from public.academic_result_components where progress_report_id=r.id and component_key='attendance'),0),
    overall_score=case when applied_weight>0 then round(earned/applied_weight,2) else 0 end,
    calculated_at=now(),
    calculation_snapshot=jsonb_build_object('scheme_id',scheme.id,'scheme_name',scheme.name,
      'weights',scheme.components,'calculated_by',p_actor_id,'academic_offering_id',r.academic_offering_id,
      'offering_period_id',r.offering_period_id,'missing_components',missing,
      'not_assessed_components',not_assessed,'applied_weight',applied_weight,
      'attendance_policy','present and late count as attended; excused leaves the denominator')
  where id=r.id;

  return jsonb_build_object(
    'overall_score',case when applied_weight>0 then round(earned/applied_weight,2) else 0 end,
    'scheme',scheme.name,
    'pathway',(select pathway from public.academic_offerings where id=r.academic_offering_id),
    'applied_weight',applied_weight,
    'missing_components',missing,
    'not_assessed_components',not_assessed);
end;
$$;

revoke all on function public.recalculate_academic_result(uuid,uuid) from public,authenticated;
grant execute on function public.recalculate_academic_result(uuid,uuid) to service_role;

comment on function public.recalculate_academic_result(uuid,uuid) is
  'Weights each component by the active scheme over the components the class is actually assessed on, respecting per-assessment metadata.weight. evidence_missing marks a component that was expected but has nothing recorded; components the class is not assessed on are listed as not_assessed and never block publication.';
