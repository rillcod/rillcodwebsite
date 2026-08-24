-- Assessment marks only belong in an automatic result when their class,
-- offering and delivery period are traceable. Keep that lineage current when
-- either the learner attempt or its parent assessment changes. This migration
-- never changes a mark, answer, feedback, moderation decision or submission.

create or replace function public.bind_evidence_to_academic_offering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offering uuid;
  v_period uuid;
begin
  if new.class_id is not null then
    select academic_offering_id, offering_period_id
      into v_offering, v_period
    from public.classes
    where id = new.class_id;

    -- A class is the authority for its offering. Do not retain a stale
    -- offering when staff deliberately repair an assessment's class link.
    new.academic_offering_id := v_offering;
    new.offering_period_id := v_period;
  else
    new.academic_offering_id := null;
    new.offering_period_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.sync_academic_assessment_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.assignments%rowtype;
  v_cbt public.cbt_exams%rowtype;
  v_exam public.exams%rowtype;
  v_student uuid;
begin
  if tg_table_name = 'assignment_submissions' then
    select * into v_assignment from public.assignments where id = new.assignment_id;
    v_student := coalesce(new.portal_user_id, new.student_id, new.user_id);
    if v_student is null or v_assignment.id is null then return new; end if;

    insert into public.academic_assessment_evidence (
      evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
      academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
      curriculum_year_number, curriculum_term_number, curriculum_week_number,
      academic_offering_id, offering_period_id,
      raw_score, maximum_score, percentage, evidence_status, grading_mode, graded_by, graded_at,
      evidence_snapshot, updated_at
    ) values (
      'assignment_submission', new.id, new.assignment_id, v_student, v_assignment.school_id,
      v_assignment.class_id, v_assignment.course_id, v_assignment.term_id,
      v_assignment.curriculum_release_id, v_assignment.lesson_plan_id, v_assignment.lesson_id,
      v_assignment.curriculum_year_number, v_assignment.curriculum_term_number,
      v_assignment.curriculum_week_number, v_assignment.academic_offering_id,
      v_assignment.offering_period_id, new.grade, v_assignment.max_points,
      case when new.grade is null or coalesce(v_assignment.max_points, 0) = 0 then null
           else round((new.grade::numeric / v_assignment.max_points::numeric) * 100, 2) end,
      case when new.status = 'graded' then 'graded'
           when new.status = 'submitted' then 'submitted' else 'draft' end,
      coalesce(new.grading_mode, v_assignment.grading_mode), new.graded_by, new.graded_at,
      jsonb_build_object('feedback', new.feedback, 'weighted_score', new.weighted_score), now()
    ) on conflict (evidence_type, source_id) do update set
      assessment_id = excluded.assessment_id, student_id = excluded.student_id,
      school_id = excluded.school_id, class_id = excluded.class_id, course_id = excluded.course_id,
      academic_term_id = excluded.academic_term_id,
      curriculum_release_id = excluded.curriculum_release_id,
      lesson_plan_id = excluded.lesson_plan_id, lesson_id = excluded.lesson_id,
      curriculum_year_number = excluded.curriculum_year_number,
      curriculum_term_number = excluded.curriculum_term_number,
      curriculum_week_number = excluded.curriculum_week_number,
      academic_offering_id = excluded.academic_offering_id,
      offering_period_id = excluded.offering_period_id,
      raw_score = excluded.raw_score, maximum_score = excluded.maximum_score,
      percentage = excluded.percentage, evidence_status = excluded.evidence_status,
      grading_mode = excluded.grading_mode, graded_by = excluded.graded_by,
      graded_at = excluded.graded_at, evidence_snapshot = excluded.evidence_snapshot,
      updated_at = now();

  elsif tg_table_name = 'cbt_sessions' then
    select * into v_cbt from public.cbt_exams where id = new.exam_id;
    if new.user_id is null or v_cbt.id is null then return new; end if;

    insert into public.academic_assessment_evidence (
      evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
      academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
      curriculum_year_number, curriculum_term_number, curriculum_week_number,
      academic_offering_id, offering_period_id,
      raw_score, maximum_score, percentage, evidence_status, grading_mode,
      graded_at, evidence_snapshot, updated_at
    ) values (
      'cbt_session', new.id, new.exam_id, new.user_id, v_cbt.school_id, v_cbt.class_id,
      v_cbt.course_id, v_cbt.term_id, v_cbt.curriculum_release_id, v_cbt.lesson_plan_id,
      v_cbt.lesson_id, v_cbt.curriculum_year_number, v_cbt.curriculum_term_number,
      v_cbt.curriculum_week_number, v_cbt.academic_offering_id, v_cbt.offering_period_id,
      new.score, 100, new.score,
      case when coalesce(v_cbt.metadata ->> 'result_eligible', 'true') = 'false' then 'recorded'
           when new.status in ('completed', 'passed', 'failed') then 'graded' else 'submitted' end,
      v_cbt.grading_mode, new.end_time,
      jsonb_build_object('needs_grading', new.needs_grading, 'status', new.status), now()
    ) on conflict (evidence_type, source_id) do update set
      assessment_id = excluded.assessment_id, student_id = excluded.student_id,
      school_id = excluded.school_id, class_id = excluded.class_id, course_id = excluded.course_id,
      academic_term_id = excluded.academic_term_id,
      curriculum_release_id = excluded.curriculum_release_id,
      lesson_plan_id = excluded.lesson_plan_id, lesson_id = excluded.lesson_id,
      curriculum_year_number = excluded.curriculum_year_number,
      curriculum_term_number = excluded.curriculum_term_number,
      curriculum_week_number = excluded.curriculum_week_number,
      academic_offering_id = excluded.academic_offering_id,
      offering_period_id = excluded.offering_period_id,
      raw_score = excluded.raw_score, maximum_score = excluded.maximum_score,
      percentage = excluded.percentage, evidence_status = excluded.evidence_status,
      grading_mode = excluded.grading_mode, graded_at = excluded.graded_at,
      evidence_snapshot = excluded.evidence_snapshot, updated_at = now();

  elsif tg_table_name = 'exam_attempts' then
    select * into v_exam from public.exams where id = new.exam_id;
    if new.portal_user_id is null or v_exam.id is null then return new; end if;

    insert into public.academic_assessment_evidence (
      evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
      academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
      curriculum_year_number, curriculum_term_number, curriculum_week_number,
      academic_offering_id, offering_period_id,
      raw_score, maximum_score, percentage, evidence_status, grading_mode,
      graded_at, evidence_snapshot, updated_at
    ) values (
      'exam_attempt', new.id, new.exam_id, new.portal_user_id, v_exam.school_id, v_exam.class_id,
      v_exam.course_id, v_exam.term_id, v_exam.curriculum_release_id, v_exam.lesson_plan_id,
      v_exam.lesson_id, v_exam.curriculum_year_number, v_exam.curriculum_term_number,
      v_exam.curriculum_week_number, v_exam.academic_offering_id, v_exam.offering_period_id,
      new.score, new.total_points, new.percentage,
      case when new.submitted_at is not null then 'graded' else 'submitted' end,
      v_exam.grading_mode, new.submitted_at,
      jsonb_build_object('attempt_number', new.attempt_number, 'status', new.status), now()
    ) on conflict (evidence_type, source_id) do update set
      assessment_id = excluded.assessment_id, student_id = excluded.student_id,
      school_id = excluded.school_id, class_id = excluded.class_id, course_id = excluded.course_id,
      academic_term_id = excluded.academic_term_id,
      curriculum_release_id = excluded.curriculum_release_id,
      lesson_plan_id = excluded.lesson_plan_id, lesson_id = excluded.lesson_id,
      curriculum_year_number = excluded.curriculum_year_number,
      curriculum_term_number = excluded.curriculum_term_number,
      curriculum_week_number = excluded.curriculum_week_number,
      academic_offering_id = excluded.academic_offering_id,
      offering_period_id = excluded.offering_period_id,
      raw_score = excluded.raw_score, maximum_score = excluded.maximum_score,
      percentage = excluded.percentage, evidence_status = excluded.evidence_status,
      grading_mode = excluded.grading_mode, graded_at = excluded.graded_at,
      evidence_snapshot = excluded.evidence_snapshot, updated_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.sync_weekly_practical_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.lesson_plans%rowtype;
begin
  select * into v_plan from public.lesson_plans where id = new.lesson_plan_id;
  if v_plan.id is null then return new; end if;

  insert into public.academic_assessment_evidence(
    evidence_type, source_id, student_id, school_id, class_id, course_id, academic_term_id,
    curriculum_release_id, lesson_plan_id, curriculum_year_number, curriculum_term_number,
    curriculum_week_number, academic_offering_id, offering_period_id,
    raw_score, maximum_score, percentage, evidence_status, graded_by,
    graded_at, evidence_snapshot, updated_at
  ) values (
    'weekly_practical', new.id, new.student_id, new.school_id, new.class_id, new.course_id,
    v_plan.term_id, v_plan.curriculum_release_id, new.lesson_plan_id, new.year_number,
    new.term_number, new.week_number, v_plan.academic_offering_id, v_plan.offering_period_id,
    new.practical_score, 100, new.practical_score,
    case when new.completed then 'graded' else 'recorded' end,
    new.recorded_by, new.updated_at, jsonb_build_object('completed', new.completed,
      'completion_seconds', new.completion_seconds, 'retry_count', new.retry_count), now()
  ) on conflict(evidence_type, source_id) do update set
    student_id = excluded.student_id, school_id = excluded.school_id,
    class_id = excluded.class_id, course_id = excluded.course_id,
    academic_term_id = excluded.academic_term_id,
    curriculum_release_id = excluded.curriculum_release_id,
    lesson_plan_id = excluded.lesson_plan_id,
    curriculum_year_number = excluded.curriculum_year_number,
    curriculum_term_number = excluded.curriculum_term_number,
    curriculum_week_number = excluded.curriculum_week_number,
    academic_offering_id = excluded.academic_offering_id,
    offering_period_id = excluded.offering_period_id,
    raw_score = excluded.raw_score, maximum_score = excluded.maximum_score,
    percentage = excluded.percentage, evidence_status = excluded.evidence_status,
    graded_by = excluded.graded_by, graded_at = excluded.graded_at,
    evidence_snapshot = excluded.evidence_snapshot, updated_at = now();
  return new;
end;
$$;

-- Parent context changes must repair existing evidence immediately; waiting
-- for a learner to resubmit would leave Auto-fill silently incomplete.
create or replace function public.refresh_assessment_evidence_parent_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  v_type := case tg_table_name
    when 'assignments' then 'assignment_submission'
    when 'cbt_exams' then 'cbt_session'
    when 'exams' then 'exam_attempt'
  end;

  update public.academic_assessment_evidence
  set school_id = new.school_id,
      class_id = new.class_id,
      course_id = new.course_id,
      academic_term_id = new.term_id,
      curriculum_release_id = new.curriculum_release_id,
      lesson_plan_id = new.lesson_plan_id,
      lesson_id = new.lesson_id,
      curriculum_year_number = new.curriculum_year_number,
      curriculum_term_number = new.curriculum_term_number,
      curriculum_week_number = new.curriculum_week_number,
      academic_offering_id = new.academic_offering_id,
      offering_period_id = new.offering_period_id,
      updated_at = now()
  where evidence_type = v_type and assessment_id = new.id;

  if tg_table_name = 'cbt_exams' then
    update public.academic_assessment_evidence e
    set evidence_status = case
          when coalesce(new.metadata ->> 'result_eligible', 'true') = 'false' then 'recorded'
          when s.status in ('completed', 'passed', 'failed') then 'graded'
          else 'submitted'
        end,
        updated_at = now()
    from public.cbt_sessions s
    where e.evidence_type = 'cbt_session'
      and e.assessment_id = new.id
      and e.source_id = s.id;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_assignment_evidence_parent_context on public.assignments;
create trigger refresh_assignment_evidence_parent_context
after update of school_id, class_id, course_id, term_id, curriculum_release_id,
  lesson_plan_id, lesson_id, curriculum_year_number, curriculum_term_number,
  curriculum_week_number, academic_offering_id, offering_period_id
on public.assignments for each row execute function public.refresh_assessment_evidence_parent_context();

drop trigger if exists refresh_cbt_evidence_parent_context on public.cbt_exams;
create trigger refresh_cbt_evidence_parent_context
after update of school_id, class_id, course_id, term_id, curriculum_release_id,
  lesson_plan_id, lesson_id, curriculum_year_number, curriculum_term_number,
  curriculum_week_number, academic_offering_id, offering_period_id, metadata
on public.cbt_exams for each row execute function public.refresh_assessment_evidence_parent_context();

drop trigger if exists refresh_exam_evidence_parent_context on public.exams;
create trigger refresh_exam_evidence_parent_context
after update of school_id, class_id, course_id, term_id, curriculum_release_id,
  lesson_plan_id, lesson_id, curriculum_year_number, curriculum_term_number,
  curriculum_week_number, academic_offering_id, offering_period_id
on public.exams for each row execute function public.refresh_assessment_evidence_parent_context();

-- Recover only legacy CBTs whose own metadata records the exact target class.
-- Compatibility checks make this deterministic; no class is inferred from a
-- learner's current enrolment because the learner may have moved since sitting.
update public.cbt_exams x
set class_id = c.id,
    school_id = coalesce(x.school_id, c.school_id),
    program_id = coalesce(x.program_id, c.program_id),
    term_id = coalesce(x.term_id, c.term_id),
    metadata = coalesce(x.metadata, '{}'::jsonb)
      || jsonb_build_object('assessment_scope', 'class_result', 'result_eligible', true,
        'target_class_id', c.id, 'visibility', 'class')
from public.classes c
where x.class_id is null
  and coalesce(x.metadata ->> 'target_class_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and c.id = (x.metadata ->> 'target_class_id')::uuid
  and (x.school_id is null or x.school_id = c.school_id)
  and (x.program_id is null or c.program_id is null or x.program_id = c.program_id)
  and (x.term_id is null or c.term_id is null or x.term_id = c.term_id)
  and c.academic_offering_id is not null
  and c.offering_period_id is not null;

-- Context-only backfill from surviving authoritative parents. Orphaned legacy
-- evidence remains preserved and legacy_unscoped rather than being guessed.
update public.academic_assessment_evidence e
set school_id = a.school_id, class_id = a.class_id, course_id = a.course_id,
    academic_term_id = a.term_id, curriculum_release_id = a.curriculum_release_id,
    lesson_plan_id = a.lesson_plan_id, lesson_id = a.lesson_id,
    curriculum_year_number = a.curriculum_year_number,
    curriculum_term_number = a.curriculum_term_number,
    curriculum_week_number = a.curriculum_week_number,
    academic_offering_id = a.academic_offering_id, offering_period_id = a.offering_period_id,
    updated_at = now()
from public.assignments a
where e.evidence_type = 'assignment_submission' and e.assessment_id = a.id;

update public.academic_assessment_evidence e
set school_id = x.school_id, class_id = x.class_id, course_id = x.course_id,
    academic_term_id = x.term_id, curriculum_release_id = x.curriculum_release_id,
    lesson_plan_id = x.lesson_plan_id, lesson_id = x.lesson_id,
    curriculum_year_number = x.curriculum_year_number,
    curriculum_term_number = x.curriculum_term_number,
    curriculum_week_number = x.curriculum_week_number,
    academic_offering_id = x.academic_offering_id, offering_period_id = x.offering_period_id,
    updated_at = now()
from public.cbt_exams x
where e.evidence_type = 'cbt_session' and e.assessment_id = x.id;

update public.academic_assessment_evidence e
set school_id = x.school_id, class_id = x.class_id, course_id = x.course_id,
    academic_term_id = x.term_id, curriculum_release_id = x.curriculum_release_id,
    lesson_plan_id = x.lesson_plan_id, lesson_id = x.lesson_id,
    curriculum_year_number = x.curriculum_year_number,
    curriculum_term_number = x.curriculum_term_number,
    curriculum_week_number = x.curriculum_week_number,
    academic_offering_id = x.academic_offering_id, offering_period_id = x.offering_period_id,
    updated_at = now()
from public.exams x
where e.evidence_type = 'exam_attempt' and e.assessment_id = x.id;

update public.academic_assessment_evidence e
set school_id = p.school_id, class_id = p.class_id, course_id = p.course_id,
    academic_term_id = p.term_id, curriculum_release_id = p.curriculum_release_id,
    lesson_plan_id = p.id, academic_offering_id = p.academic_offering_id,
    offering_period_id = p.offering_period_id, updated_at = now()
from public.lesson_plans p
where e.evidence_type = 'weekly_practical' and e.lesson_plan_id = p.id;

comment on function public.sync_academic_assessment_evidence() is
  'Single assignment, CBT and written-exam evidence handoff. Refreshes marks and the complete academic lineage without inventing missing context.';
comment on function public.refresh_assessment_evidence_parent_context() is
  'Propagates a verified parent assessment context repair to existing evidence without changing learner scores or submissions.';
