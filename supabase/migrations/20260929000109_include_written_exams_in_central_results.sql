-- One central calculator must consume every official evidence source. Written
-- exam attempts were synchronized but omitted from Theory / examination, and
-- availability checks could be triggered by another class using the same course.

create or replace function public.safe_assessment_weight(p_metadata jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_metadata ->> 'weight', '')), '');
  v_weight numeric;
begin
  if v_text is null or v_text !~ '^[0-9]+([.][0-9]+)?$' then return 1; end if;
  v_weight := v_text::numeric;
  if v_weight <= 0 or v_weight > 100 then return 1; end if;
  return v_weight;
exception when others then
  return 1;
end;
$$;

create or replace function public.recalculate_academic_result(
  p_report_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.student_progress_reports%rowtype;
  scheme public.academic_assessment_schemes%rowtype;
  k text; lbl text; raw numeric; wt numeric; weighted numeric; n int; ids uuid[];
  earned numeric := 0; applied_weight numeric := 0; final_score numeric := 0;
  missing jsonb := '[]'::jsonb; not_assessed jsonb := '[]'::jsonb;
  n_sessions int := 0; n_present int := 0; n_excused int := 0; n_counted int := 0;
  attendance_ids uuid[] := '{}';
  available boolean;
  keys text[] := array['theory','classwork','practical','assignments','attendance','assessment'];
  labels text[] := array['Theory / examination','Classwork','Practical / project','Assignments','Attendance','Mid-term assessment'];
begin
  select * into r from public.student_progress_reports where id = p_report_id for update;
  if r.id is null then raise exception 'Progress report not found.'; end if;
  if r.calculation_mode = 'manual' then
    raise exception using message = 'This is a manually entered result and will not be overwritten.',
      hint = 'Choose Automatic only when the system should calculate from recorded evidence.';
  end if;
  if r.class_id is null or r.course_id is null or r.curriculum_release_id is null
     or r.academic_offering_id is null or r.offering_period_id is null then
    raise exception using message = 'The result is missing its academic offering context.',
      hint = 'Attach the learner to a regular school, online school, bootcamp or short-course class first.';
  end if;

  select * into scheme from public.academic_assessment_schemes s
  where s.status = 'active'
    and public.valid_academic_assessment_components(s.components)
    and (s.academic_offering_id is null or s.academic_offering_id = r.academic_offering_id)
    and (s.school_id is null or s.school_id = r.school_id)
    and (s.course_id is null or s.course_id = r.course_id)
    and (s.academic_term_id is null or s.academic_term_id = r.term_id)
  order by (s.academic_offering_id is not null)::int * 8
      + (s.school_id is not null)::int * 4
      + (s.course_id is not null)::int * 2
      + (s.academic_term_id is not null)::int desc,
    s.updated_at desc,
    s.id desc
  limit 1;
  if scheme.id is null then raise exception 'No active assessment weighting scheme is available.'; end if;

  delete from public.academic_result_components where progress_report_id = r.id;
  for i in 1..array_length(keys, 1) loop
    k := keys[i]; lbl := labels[i]; wt := coalesce((scheme.components ->> k)::numeric, 0);
    raw := null; n := 0; ids := '{}'; available := false;

    if k = 'theory' then
      select exists(
        select 1 from public.cbt_exams x
        where x.class_id = r.class_id and x.course_id = r.course_id
          and x.academic_offering_id = r.academic_offering_id
          and x.offering_period_id = r.offering_period_id
          and coalesce(x.is_active, false) = true
          and coalesce(x.metadata ->> 'result_eligible', 'true') <> 'false'
          and coalesce(x.metadata ->> 'exam_type', 'examination') <> 'evaluation'
      ) or exists(
        select 1 from public.exams x
        where x.class_id = r.class_id and x.course_id = r.course_id
          and x.academic_offering_id = r.academic_offering_id
          and x.offering_period_id = r.offering_period_id
          and coalesce(x.is_active, false) = true
          and coalesce(x.metadata ->> 'result_eligible', 'true') <> 'false'
      ) into available;
      select sum(q.percentage * q.w) / nullif(sum(q.w), 0), count(*), coalesce(array_agg(q.id), '{}')
        into raw, n, ids
      from (
        select e.id, e.percentage, public.safe_assessment_weight(x.metadata) as w
        from public.academic_assessment_evidence e
        join public.cbt_exams x on x.id = e.assessment_id
        where e.evidence_type = 'cbt_session'
          and e.student_id = r.student_id and e.academic_offering_id = r.academic_offering_id
          and e.offering_period_id = r.offering_period_id and e.class_id = r.class_id
          and e.course_id = r.course_id and e.evidence_status in ('graded','moderated')
          and e.percentage is not null
          and coalesce(x.metadata ->> 'exam_type', 'examination') <> 'evaluation'
        union all
        select e.id, e.percentage, public.safe_assessment_weight(x.metadata) as w
        from public.academic_assessment_evidence e
        join public.exams x on x.id = e.assessment_id
        where e.evidence_type = 'exam_attempt'
          and e.student_id = r.student_id and e.academic_offering_id = r.academic_offering_id
          and e.offering_period_id = r.offering_period_id and e.class_id = r.class_id
          and e.course_id = r.course_id and e.evidence_status in ('graded','moderated')
          and e.percentage is not null
      ) q;

    elsif k = 'assessment' then
      select exists(select 1 from public.cbt_exams x
        where x.class_id = r.class_id and x.course_id = r.course_id
          and x.academic_offering_id = r.academic_offering_id
          and x.offering_period_id = r.offering_period_id
          and coalesce(x.is_active, false) = true
          and coalesce(x.metadata ->> 'result_eligible', 'true') <> 'false'
          and x.metadata ->> 'exam_type' = 'evaluation') into available;
      select sum(e.percentage * public.safe_assessment_weight(x.metadata))
          / nullif(sum(public.safe_assessment_weight(x.metadata)), 0),
        count(*), coalesce(array_agg(e.id), '{}')
        into raw, n, ids
      from public.academic_assessment_evidence e
      join public.cbt_exams x on x.id = e.assessment_id
      where e.evidence_type = 'cbt_session'
        and e.student_id = r.student_id and e.academic_offering_id = r.academic_offering_id
        and e.offering_period_id = r.offering_period_id and e.class_id = r.class_id
        and e.course_id = r.course_id and e.evidence_status in ('graded','moderated')
        and e.percentage is not null
        and x.metadata ->> 'exam_type' = 'evaluation';

    elsif k = 'classwork' then
      select exists(select 1 from public.assignments a
        where a.class_id = r.class_id and a.course_id = r.course_id
          and a.academic_offering_id = r.academic_offering_id
          and a.offering_period_id = r.offering_period_id
          and coalesce(a.is_active, false) = true
          and coalesce(a.metadata ->> 'result_eligible', 'true') <> 'false'
          and lower(coalesce(a.assignment_type, '')) = 'classwork') into available;
      select sum(e.percentage * public.safe_assessment_weight(a.metadata))
          / nullif(sum(public.safe_assessment_weight(a.metadata)), 0),
        count(*), coalesce(array_agg(e.id), '{}')
        into raw, n, ids
      from public.academic_assessment_evidence e
      join public.assignments a on a.id = e.assessment_id
      where e.evidence_type = 'assignment_submission'
        and e.student_id = r.student_id and e.academic_offering_id = r.academic_offering_id
        and e.offering_period_id = r.offering_period_id and e.class_id = r.class_id
        and e.course_id = r.course_id and e.evidence_status in ('graded','moderated')
        and e.percentage is not null
        and lower(coalesce(a.assignment_type, '')) = 'classwork';

    elsif k = 'assignments' then
      select exists(select 1 from public.assignments a
        where a.class_id = r.class_id and a.course_id = r.course_id
          and a.academic_offering_id = r.academic_offering_id
          and a.offering_period_id = r.offering_period_id
          and coalesce(a.is_active, false) = true
          and coalesce(a.metadata ->> 'result_eligible', 'true') <> 'false'
          and lower(coalesce(a.assignment_type, 'assignment')) not in ('classwork','project','practical'))
        into available;
      select sum(e.percentage * public.safe_assessment_weight(a.metadata))
          / nullif(sum(public.safe_assessment_weight(a.metadata)), 0),
        count(*), coalesce(array_agg(e.id), '{}')
        into raw, n, ids
      from public.academic_assessment_evidence e
      join public.assignments a on a.id = e.assessment_id
      where e.evidence_type = 'assignment_submission'
        and e.student_id = r.student_id and e.academic_offering_id = r.academic_offering_id
        and e.offering_period_id = r.offering_period_id and e.class_id = r.class_id
        and e.course_id = r.course_id and e.evidence_status in ('graded','moderated')
        and e.percentage is not null
        and lower(coalesce(a.assignment_type, 'assignment')) not in ('classwork','project','practical');

    elsif k = 'practical' then
      select exists(select 1 from public.assignments a
        where a.class_id = r.class_id and a.course_id = r.course_id
          and a.academic_offering_id = r.academic_offering_id
          and a.offering_period_id = r.offering_period_id
          and coalesce(a.is_active, false) = true
          and coalesce(a.metadata ->> 'result_eligible', 'true') <> 'false'
          and lower(coalesce(a.assignment_type, '')) in ('project','practical'))
        or exists(select 1 from public.academic_assessment_evidence e
          where e.class_id = r.class_id and e.course_id = r.course_id
            and e.academic_offering_id = r.academic_offering_id
            and e.offering_period_id = r.offering_period_id
            and e.evidence_type = 'weekly_practical') into available;
      select sum(q.percentage * q.w) / nullif(sum(q.w), 0), count(*), coalesce(array_agg(q.id), '{}')
        into raw, n, ids
      from (
        select e.id, e.percentage,
          case when e.evidence_type = 'weekly_practical' then 1
            else public.safe_assessment_weight(a.metadata) end as w
        from public.academic_assessment_evidence e
        left join public.assignments a
          on a.id = e.assessment_id and e.evidence_type = 'assignment_submission'
        where e.student_id = r.student_id and e.academic_offering_id = r.academic_offering_id
          and e.offering_period_id = r.offering_period_id and e.class_id = r.class_id
          and e.course_id = r.course_id and e.evidence_status in ('graded','moderated')
          and e.percentage is not null
          and (e.evidence_type = 'weekly_practical'
            or (e.evidence_type = 'assignment_submission'
              and lower(coalesce(a.assignment_type, '')) in ('project','practical')))
      ) q;

    elsif k = 'attendance' then
      select count(*) into n_sessions from public.class_sessions s
      where s.class_id = r.class_id and (r.term_id is null or s.term_id = r.term_id);
      available := n_sessions > 0;
      if n_sessions > 0 then
        select count(*) filter (where a.status in ('present','late')),
          count(*) filter (where a.status = 'excused'),
          coalesce(array_agg(a.id) filter (where a.status in ('present','late')), '{}')
          into n_present, n_excused, attendance_ids
        from public.attendance a join public.class_sessions s on s.id = a.session_id
        where a.user_id = r.student_id and s.class_id = r.class_id
          and (r.term_id is null or s.term_id = r.term_id);
        n_counted := greatest(n_sessions - n_excused, 0);
        raw := case when n_counted > 0
          then round((n_present::numeric / n_counted::numeric) * 100, 2) else 0 end;
        n := n_present; ids := attendance_ids;
        if n_counted = 0 then available := false; end if;
      end if;
    end if;

    -- Historical/deactivated definitions still count when graded evidence exists.
    if n > 0 then available := true; end if;
    if not available or wt = 0 then
      if wt > 0 then not_assessed := not_assessed || jsonb_build_array(k); end if;
    else
      raw := coalesce(raw, 0);
      earned := earned + raw * wt;
      applied_weight := applied_weight + wt;
      if n = 0 then missing := missing || jsonb_build_array(k); end if;
    end if;

    weighted := round(coalesce(raw, 0) * wt / 100, 2);
    insert into public.academic_result_components(
      progress_report_id, component_key, component_label, weight, raw_score,
      weighted_score, evidence_count, evidence_ids, source_summary, evidence_missing
    ) values (
      r.id, k, lbl, wt, raw, weighted, n, ids,
      case when k = 'attendance' then jsonb_build_object(
          'held_sessions', n_sessions, 'present_sessions', n_present,
          'excused_sessions', n_excused, 'counted_sessions', n_counted)
        else jsonb_build_object('assessed', available) end,
      available and wt > 0 and n = 0
    );
  end loop;

  final_score := case when applied_weight > 0 then round(earned / applied_weight, 2) else 0 end;
  update public.student_progress_reports set
    theory_score = coalesce((select raw_score from public.academic_result_components where progress_report_id = r.id and component_key = 'theory'), 0),
    practical_score = coalesce((select raw_score from public.academic_result_components where progress_report_id = r.id and component_key = 'practical'), 0),
    attendance_score = coalesce((select raw_score from public.academic_result_components where progress_report_id = r.id and component_key = 'assignments'), 0),
    participation_score = coalesce((select raw_score from public.academic_result_components where progress_report_id = r.id and component_key = 'attendance'), 0),
    engagement_metrics = coalesce(r.engagement_metrics, '{}'::jsonb) || jsonb_build_object(
      'classwork_score', coalesce((select raw_score from public.academic_result_components where progress_report_id = r.id and component_key = 'classwork'), 0),
      'assessment_score', coalesce((select raw_score from public.academic_result_components where progress_report_id = r.id and component_key = 'assessment'), 0),
      'score_weights', scheme.components,
      'grading_scheme_id', scheme.id,
      'grading_scheme_name', scheme.name
    ),
    overall_score = final_score,
    overall_grade = case
      when final_score >= 75 then 'A1' when final_score >= 70 then 'B2'
      when final_score >= 65 then 'B3' when final_score >= 60 then 'C4'
      when final_score >= 55 then 'C5' when final_score >= 50 then 'C6'
      when final_score >= 45 then 'D7' when final_score >= 40 then 'E8'
      else 'F9' end,
    calculated_at = now(),
    updated_at = now(),
    calculation_snapshot = jsonb_build_object(
      'scheme_id', scheme.id, 'scheme_name', scheme.name, 'weights', scheme.components,
      'calculated_by', p_actor_id, 'academic_offering_id', r.academic_offering_id,
      'offering_period_id', r.offering_period_id, 'missing_components', missing,
      'not_assessed_components', not_assessed, 'applied_weight', applied_weight,
      'attendance_policy', 'present and late count as attended; excused leaves the denominator'
    )
  where id = r.id;

  return jsonb_build_object(
    'overall_score', final_score,
    'overall_grade', case
      when final_score >= 75 then 'A1' when final_score >= 70 then 'B2'
      when final_score >= 65 then 'B3' when final_score >= 60 then 'C4'
      when final_score >= 55 then 'C5' when final_score >= 50 then 'C6'
      when final_score >= 45 then 'D7' when final_score >= 40 then 'E8'
      else 'F9' end,
    'scheme', scheme.name,
    'pathway', (select pathway from public.academic_offerings where id = r.academic_offering_id),
    'applied_weight', applied_weight,
    'missing_components', missing,
    'not_assessed_components', not_assessed
  );
end;
$$;

revoke all on function public.recalculate_academic_result(uuid,uuid) from public, authenticated;
grant execute on function public.recalculate_academic_result(uuid,uuid) to service_role;

comment on function public.recalculate_academic_result(uuid,uuid) is
  'Single official calculator for assignments, projects, weekly practicals, CBT, written exams and attendance. Uses exact class/offering/period evidence, snapshots one central weighting scheme, and keeps report display fields synchronized.';
