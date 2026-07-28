-- Complete the academic spine from official curriculum through teaching,
-- assessment evidence, moderated results and progression decisions.
-- Existing rows remain in legacy-compatible mode; new traceable reports use
-- the guarded path and cannot be published without real assessment evidence.

alter table public.assignments
  add column if not exists lesson_plan_id uuid references public.lesson_plans(id) on delete restrict,
  add column if not exists curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete restrict,
  add column if not exists curriculum_year_number integer,
  add column if not exists curriculum_term_number integer,
  add column if not exists curriculum_week_number integer,
  add column if not exists learning_outcomes jsonb not null default '[]'::jsonb;

update public.assignments
set lesson_plan_id = nullif(metadata ->> 'lesson_plan_id', '')::uuid
where lesson_plan_id is null
  and coalesce(metadata ->> 'lesson_plan_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

alter table public.cbt_exams
  add column if not exists curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete restrict,
  add column if not exists curriculum_year_number integer,
  add column if not exists curriculum_term_number integer,
  add column if not exists learning_outcomes jsonb not null default '[]'::jsonb;

alter table public.exams
  add column if not exists school_id uuid references public.schools(id) on delete restrict,
  add column if not exists class_id uuid references public.classes(id) on delete restrict,
  add column if not exists program_id uuid references public.programs(id) on delete set null,
  add column if not exists term_id uuid references public.academic_terms(id) on delete restrict,
  add column if not exists lesson_plan_id uuid references public.lesson_plans(id) on delete restrict,
  add column if not exists lesson_id uuid references public.lessons(id) on delete set null,
  add column if not exists curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete restrict,
  add column if not exists curriculum_year_number integer,
  add column if not exists curriculum_term_number integer,
  add column if not exists curriculum_week_number integer,
  add column if not exists learning_outcomes jsonb not null default '[]'::jsonb,
  add column if not exists grading_mode text not null default 'manual',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.student_progress_reports
  add column if not exists class_id uuid references public.classes(id) on delete restrict,
  add column if not exists program_id uuid references public.programs(id) on delete set null,
  add column if not exists curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete restrict,
  add column if not exists evidence_manifest jsonb not null default '{}'::jsonb,
  add column if not exists academic_trace_status text not null default 'legacy'
    check (academic_trace_status in ('legacy', 'traceable')),
  add column if not exists academic_qa_status text not null default 'not_checked'
    check (academic_qa_status in ('not_checked', 'ready', 'needs_attention', 'blocked')),
  add column if not exists academic_qa_issues jsonb not null default '[]'::jsonb,
  add column if not exists academic_qa_checked_at timestamptz,
  add column if not exists curriculum_coverage numeric(5,2),
  add column if not exists teaching_delivery_pct numeric(5,2);

alter table public.enrollment_term_grades
  add column if not exists school_id uuid references public.schools(id) on delete restrict,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete restrict,
  add column if not exists evidence_manifest jsonb not null default '{}'::jsonb,
  add column if not exists moderation_status text not null default 'unreviewed'
    check (moderation_status in ('unreviewed', 'reviewed', 'approved', 'returned')),
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderated_at timestamptz;

create table if not exists public.academic_assessment_evidence (
  id uuid primary key default gen_random_uuid(),
  evidence_type text not null check (evidence_type in (
    'assignment_submission', 'cbt_session', 'exam_attempt', 'weekly_practical', 'term_grade'
  )),
  source_id uuid not null,
  assessment_id uuid,
  student_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete restrict,
  class_id uuid references public.classes(id) on delete restrict,
  course_id uuid references public.courses(id) on delete restrict,
  academic_term_id uuid references public.academic_terms(id) on delete restrict,
  curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete restrict,
  lesson_plan_id uuid references public.lesson_plans(id) on delete restrict,
  lesson_id uuid references public.lessons(id) on delete set null,
  curriculum_year_number integer,
  curriculum_term_number integer,
  curriculum_week_number integer,
  raw_score numeric(10,2),
  maximum_score numeric(10,2),
  percentage numeric(5,2),
  evidence_status text not null default 'recorded'
    check (evidence_status in ('draft', 'submitted', 'recorded', 'graded', 'moderated', 'void')),
  grading_mode text,
  graded_by uuid references auth.users(id) on delete set null,
  graded_at timestamptz,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evidence_type, source_id)
);

create table if not exists public.academic_progression_decisions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid references public.classes(id) on delete set null,
  academic_term_id uuid not null references public.academic_terms(id) on delete restrict,
  progress_report_id uuid references public.student_progress_reports(id) on delete restrict,
  decision text not null check (decision in (
    'continue', 'advance', 'advance_with_support', 'repeat_focus', 'review_required'
  )),
  next_class_id uuid references public.classes(id) on delete set null,
  rationale text not null,
  support_plan jsonb not null default '{}'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  decided_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.bind_assessment_to_academic_spine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.lesson_plans%rowtype;
  v_lesson_plan_id uuid;
  v_lesson_week integer;
begin
  v_lesson_plan_id := new.lesson_plan_id;
  if new.lesson_id is not null then
    select lesson_plan_id, curriculum_week_number
      into v_lesson_plan_id, v_lesson_week
    from public.lessons where id = new.lesson_id;
    if v_lesson_plan_id is null then
      raise exception 'The selected lesson is not attached to a teaching plan.';
    end if;
  end if;

  if v_lesson_plan_id is null
     and new.class_id is not null and new.term_id is not null and new.course_id is not null then
    select id into v_lesson_plan_id
    from public.lesson_plans
    where class_id = new.class_id and term_id = new.term_id and course_id = new.course_id
      and status <> 'archived'
    limit 1;
  end if;

  if v_lesson_plan_id is null then
    return new;
  end if;

  select * into v_plan from public.lesson_plans where id = v_lesson_plan_id;
  if v_plan.id is null or v_plan.status = 'archived' then
    raise exception 'The teaching plan for this assessment is unavailable.';
  end if;
  if new.class_id is not null and new.class_id <> v_plan.class_id then
    raise exception 'Assessment class does not match its teaching plan.';
  end if;
  if new.course_id is not null and new.course_id <> v_plan.course_id then
    raise exception 'Assessment course does not match its teaching plan.';
  end if;
  if new.term_id is not null and new.term_id <> v_plan.term_id then
    raise exception 'Assessment term does not match its teaching plan.';
  end if;

  new.lesson_plan_id := v_plan.id;
  new.class_id := v_plan.class_id;
  new.course_id := v_plan.course_id;
  new.term_id := v_plan.term_id;
  new.school_id := v_plan.school_id;
  new.curriculum_release_id := v_plan.curriculum_release_id;
  if new.curriculum_week_number is null then
    new.curriculum_week_number := v_lesson_week;
  end if;
  return new;
end;
$$;

drop trigger if exists bind_assignment_to_academic_spine on public.assignments;
create trigger bind_assignment_to_academic_spine
before insert or update of lesson_plan_id, lesson_id, class_id, course_id, term_id, school_id, curriculum_release_id
on public.assignments for each row execute function public.bind_assessment_to_academic_spine();

drop trigger if exists bind_cbt_to_academic_spine on public.cbt_exams;
create trigger bind_cbt_to_academic_spine
before insert or update of lesson_plan_id, lesson_id, class_id, course_id, term_id, school_id, curriculum_release_id
on public.cbt_exams for each row execute function public.bind_assessment_to_academic_spine();

drop trigger if exists bind_exam_to_academic_spine on public.exams;
create trigger bind_exam_to_academic_spine
before insert or update of lesson_plan_id, lesson_id, class_id, course_id, term_id, school_id, curriculum_release_id
on public.exams for each row execute function public.bind_assessment_to_academic_spine();

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
    if v_student is null then return new; end if;
    insert into public.academic_assessment_evidence (
      evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
      academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
      curriculum_year_number, curriculum_term_number, curriculum_week_number,
      raw_score, maximum_score, percentage, evidence_status, grading_mode, graded_by, graded_at,
      evidence_snapshot, updated_at
    ) values (
      'assignment_submission', new.id, new.assignment_id, v_student, v_assignment.school_id,
      v_assignment.class_id, v_assignment.course_id, v_assignment.term_id,
      v_assignment.curriculum_release_id, v_assignment.lesson_plan_id, v_assignment.lesson_id,
      v_assignment.curriculum_year_number, v_assignment.curriculum_term_number,
      v_assignment.curriculum_week_number, new.grade, v_assignment.max_points,
      case when new.grade is null or coalesce(v_assignment.max_points, 0) = 0 then null
           else round((new.grade::numeric / v_assignment.max_points::numeric) * 100, 2) end,
      case when new.status = 'graded' then 'graded'
           when new.status = 'submitted' then 'submitted' else 'draft' end,
      coalesce(new.grading_mode, v_assignment.grading_mode), new.graded_by, new.graded_at,
      jsonb_build_object('feedback', new.feedback, 'weighted_score', new.weighted_score), now()
    ) on conflict (evidence_type, source_id) do update set
      raw_score = excluded.raw_score, maximum_score = excluded.maximum_score,
      percentage = excluded.percentage, evidence_status = excluded.evidence_status,
      grading_mode = excluded.grading_mode, graded_by = excluded.graded_by,
      graded_at = excluded.graded_at, evidence_snapshot = excluded.evidence_snapshot,
      school_id = excluded.school_id, class_id = excluded.class_id, course_id = excluded.course_id,
      academic_term_id = excluded.academic_term_id,
      curriculum_release_id = excluded.curriculum_release_id,
      lesson_plan_id = excluded.lesson_plan_id, lesson_id = excluded.lesson_id, updated_at = now();
  elsif tg_table_name = 'cbt_sessions' then
    select * into v_cbt from public.cbt_exams where id = new.exam_id;
    if new.user_id is null then return new; end if;
    insert into public.academic_assessment_evidence (
      evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
      academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
      curriculum_year_number, curriculum_term_number, curriculum_week_number,
      raw_score, maximum_score, percentage, evidence_status, grading_mode,
      graded_at, evidence_snapshot, updated_at
    ) values (
      'cbt_session', new.id, new.exam_id, new.user_id, v_cbt.school_id, v_cbt.class_id,
      v_cbt.course_id, v_cbt.term_id, v_cbt.curriculum_release_id, v_cbt.lesson_plan_id,
      v_cbt.lesson_id, v_cbt.curriculum_year_number, v_cbt.curriculum_term_number,
      v_cbt.curriculum_week_number, new.score, 100, new.score,
      case when new.status in ('completed','passed','failed') then 'graded' else 'submitted' end,
      v_cbt.grading_mode, new.end_time,
      jsonb_build_object('needs_grading', new.needs_grading, 'status', new.status), now()
    ) on conflict (evidence_type, source_id) do update set
      raw_score = excluded.raw_score, percentage = excluded.percentage,
      evidence_status = excluded.evidence_status, evidence_snapshot = excluded.evidence_snapshot,
      graded_at = excluded.graded_at, updated_at = now();
  elsif tg_table_name = 'exam_attempts' then
    select * into v_exam from public.exams where id = new.exam_id;
    if new.portal_user_id is null then return new; end if;
    insert into public.academic_assessment_evidence (
      evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
      academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
      curriculum_year_number, curriculum_term_number, curriculum_week_number,
      raw_score, maximum_score, percentage, evidence_status, grading_mode,
      graded_at, evidence_snapshot, updated_at
    ) values (
      'exam_attempt', new.id, new.exam_id, new.portal_user_id, v_exam.school_id, v_exam.class_id,
      v_exam.course_id, v_exam.term_id, v_exam.curriculum_release_id, v_exam.lesson_plan_id,
      v_exam.lesson_id, v_exam.curriculum_year_number, v_exam.curriculum_term_number,
      v_exam.curriculum_week_number, new.score, new.total_points, new.percentage,
      case when new.submitted_at is not null then 'graded' else 'submitted' end,
      v_exam.grading_mode, new.submitted_at,
      jsonb_build_object('attempt_number', new.attempt_number, 'status', new.status), now()
    ) on conflict (evidence_type, source_id) do update set
      raw_score = excluded.raw_score, maximum_score = excluded.maximum_score,
      percentage = excluded.percentage, evidence_status = excluded.evidence_status,
      graded_at = excluded.graded_at, evidence_snapshot = excluded.evidence_snapshot, updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_assignment_evidence on public.assignment_submissions;
create trigger sync_assignment_evidence after insert or update
on public.assignment_submissions for each row execute function public.sync_academic_assessment_evidence();
drop trigger if exists sync_cbt_evidence on public.cbt_sessions;
create trigger sync_cbt_evidence after insert or update
on public.cbt_sessions for each row execute function public.sync_academic_assessment_evidence();
drop trigger if exists sync_exam_evidence on public.exam_attempts;
create trigger sync_exam_evidence after insert or update
on public.exam_attempts for each row execute function public.sync_academic_assessment_evidence();

create or replace function public.evaluate_progress_report_academic_qa(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.student_progress_reports%rowtype;
  v_evidence_count integer := 0;
  v_linked_count integer := 0;
  v_delivery_count integer := 0;
  v_planned_count integer := 0;
  v_issues jsonb := '[]'::jsonb;
  v_status text := 'ready';
begin
  select * into v_report from public.student_progress_reports where id = p_report_id;
  if v_report.id is null then raise exception 'Progress report not found.'; end if;

  select count(*), count(*) filter (where lesson_plan_id is not null and curriculum_release_id is not null)
    into v_evidence_count, v_linked_count
  from public.academic_assessment_evidence
  where student_id = v_report.student_id
    and academic_term_id = v_report.term_id
    and course_id = v_report.course_id
    and (v_report.class_id is null or class_id = v_report.class_id)
    and evidence_status in ('graded', 'moderated');

  if v_report.class_id is not null then
    select count(*), count(*) filter (where status = 'delivered')
      into v_planned_count, v_delivery_count
    from public.class_lesson_delivery
    where class_id = v_report.class_id and academic_term_id = v_report.term_id
      and course_id = v_report.course_id;
  end if;

  if v_evidence_count = 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code','no_assessment_evidence','message','No graded learning evidence is attached to this learner for the selected course and term.'
    ));
    v_status := 'blocked';
  elsif v_linked_count = 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code','unlinked_evidence','message','The marks exist, but none can be traced to the official curriculum and teaching plan.'
    ));
    v_status := 'needs_attention';
  elsif v_linked_count < v_evidence_count then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code','partly_linked_evidence','message','Some marks are not yet linked to the official teaching plan.'
    ));
    v_status := 'needs_attention';
  end if;

  if v_report.curriculum_release_id is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code','missing_official_direction','message','This result is not attached to an official curriculum edition.'
    ));
    v_status := 'blocked';
  end if;

  update public.student_progress_reports set
    evidence_manifest = jsonb_build_object(
      'evidence_count', v_evidence_count,
      'officially_linked_count', v_linked_count,
      'planned_delivery_records', v_planned_count,
      'delivered_records', v_delivery_count
    ),
    academic_qa_status = v_status,
    academic_qa_issues = v_issues,
    academic_qa_checked_at = now(),
    curriculum_coverage = case when v_evidence_count = 0 then 0
      else round((v_linked_count::numeric / v_evidence_count::numeric) * 100, 2) end,
    teaching_delivery_pct = case when v_planned_count = 0 then null
      else round((v_delivery_count::numeric / v_planned_count::numeric) * 100, 2) end
  where id = p_report_id;

  return jsonb_build_object(
    'status', v_status, 'issues', v_issues, 'evidence_count', v_evidence_count,
    'officially_linked_count', v_linked_count
  );
end;
$$;

create or replace function public.guard_traceable_report_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.lesson_plans%rowtype;
  v_class_id uuid;
begin
  if new.class_id is null then
    select class_id into v_class_id from public.portal_users where id = new.student_id;
    new.class_id := v_class_id;
  end if;
  if new.class_id is not null and new.term_id is not null and new.course_id is not null then
    select * into v_plan from public.lesson_plans
    where class_id = new.class_id and term_id = new.term_id and course_id = new.course_id
      and status <> 'archived' limit 1;
    if v_plan.id is not null then
      new.curriculum_release_id := coalesce(new.curriculum_release_id, v_plan.curriculum_release_id);
      select program_id into new.program_id from public.classes where id = new.class_id;
    end if;
  end if;

  if new.academic_trace_status = 'traceable' and new.is_published
     and (tg_op = 'INSERT' or old.is_published is distinct from true) then
    if new.academic_qa_status <> 'ready' then
      raise exception using
        errcode = '23514',
        message = 'This result needs an academic evidence check before publication.',
        hint = 'Open Academic Spine, review the attached marks and teaching evidence, then publish when the status is Ready.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_traceable_report_publication on public.student_progress_reports;
create trigger guard_traceable_report_publication
before insert or update of is_published, class_id, course_id, term_id, curriculum_release_id,
  academic_trace_status, academic_qa_status
on public.student_progress_reports for each row execute function public.guard_traceable_report_publication();

-- Backfill canonical assessment scope and evidence without changing any score.
update public.assignments a set
  curriculum_release_id = p.curriculum_release_id,
  school_id = p.school_id,
  class_id = p.class_id,
  course_id = p.course_id,
  term_id = p.term_id
from public.lesson_plans p
where a.lesson_plan_id = p.id;

update public.cbt_exams c set curriculum_release_id = p.curriculum_release_id
from public.lesson_plans p where c.lesson_plan_id = p.id and c.curriculum_release_id is null;

insert into public.academic_assessment_evidence (
  evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
  academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
  curriculum_year_number, curriculum_term_number, curriculum_week_number,
  raw_score, maximum_score, percentage, evidence_status, grading_mode, graded_by, graded_at,
  evidence_snapshot
)
select 'assignment_submission', s.id, s.assignment_id,
  coalesce(s.portal_user_id, s.student_id, s.user_id), a.school_id, a.class_id, a.course_id,
  a.term_id, a.curriculum_release_id, a.lesson_plan_id, a.lesson_id,
  a.curriculum_year_number, a.curriculum_term_number, a.curriculum_week_number,
  s.grade, a.max_points,
  case when s.grade is null or coalesce(a.max_points,0)=0 then null
       else round((s.grade::numeric/a.max_points::numeric)*100,2) end,
  case when s.status='graded' then 'graded'
       when s.status='submitted' then 'submitted' else 'draft' end,
  coalesce(s.grading_mode,a.grading_mode), s.graded_by, s.graded_at,
  jsonb_build_object('feedback',s.feedback,'weighted_score',s.weighted_score)
from public.assignment_submissions s join public.assignments a on a.id=s.assignment_id
where coalesce(s.portal_user_id,s.student_id,s.user_id) is not null
on conflict (evidence_type,source_id) do nothing;

insert into public.academic_assessment_evidence (
  evidence_type, source_id, assessment_id, student_id, school_id, class_id, course_id,
  academic_term_id, curriculum_release_id, lesson_plan_id, lesson_id,
  curriculum_year_number, curriculum_term_number, curriculum_week_number,
  raw_score, maximum_score, percentage, evidence_status, grading_mode, graded_at, evidence_snapshot
)
select 'cbt_session', s.id, s.exam_id, s.user_id, e.school_id, e.class_id, e.course_id,
  e.term_id, e.curriculum_release_id, e.lesson_plan_id, e.lesson_id,
  e.curriculum_year_number, e.curriculum_term_number, e.curriculum_week_number,
  s.score,100,s.score,case when s.status in ('completed','passed','failed') then 'graded' else 'submitted' end,
  e.grading_mode,s.end_time,jsonb_build_object('needs_grading',s.needs_grading,'status',s.status)
from public.cbt_sessions s join public.cbt_exams e on e.id=s.exam_id where s.user_id is not null
on conflict (evidence_type,source_id) do nothing;

alter table public.academic_assessment_evidence enable row level security;
alter table public.academic_progression_decisions enable row level security;

create policy academic_evidence_scoped_read on public.academic_assessment_evidence for select
using (
  student_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.portal_users u where u.id=auth.uid() and u.role='school' and u.school_id=academic_assessment_evidence.school_id)
  or exists (select 1 from public.classes c where c.id=academic_assessment_evidence.class_id and c.teacher_id=auth.uid())
);
create policy academic_evidence_staff_manage on public.academic_assessment_evidence for all
using (public.is_admin() or exists (select 1 from public.classes c where c.id=academic_assessment_evidence.class_id and c.teacher_id=auth.uid()))
with check (public.is_admin() or exists (select 1 from public.classes c where c.id=academic_assessment_evidence.class_id and c.teacher_id=auth.uid()));

create policy progression_scoped_read on public.academic_progression_decisions for select
using (
  student_id=auth.uid() or public.is_admin()
  or exists (select 1 from public.portal_users u where u.id=auth.uid() and u.role='school' and u.school_id=academic_progression_decisions.school_id)
  or exists (select 1 from public.classes c where c.id=academic_progression_decisions.class_id and c.teacher_id=auth.uid())
);
create policy progression_admin_manage on public.academic_progression_decisions for all
using (public.is_admin()) with check (public.is_admin());

create index if not exists assignments_academic_spine_idx
  on public.assignments(school_id,class_id,term_id,course_id,curriculum_release_id,lesson_plan_id);
create index if not exists cbt_exams_academic_spine_idx
  on public.cbt_exams(school_id,class_id,term_id,course_id,curriculum_release_id,lesson_plan_id);
create index if not exists exams_academic_spine_idx
  on public.exams(school_id,class_id,term_id,course_id,curriculum_release_id,lesson_plan_id);
create index if not exists academic_evidence_student_scope_idx
  on public.academic_assessment_evidence(student_id,academic_term_id,course_id,class_id,evidence_status);
create index if not exists academic_evidence_release_idx
  on public.academic_assessment_evidence(curriculum_release_id,lesson_plan_id,curriculum_week_number);
create index if not exists progress_reports_academic_spine_idx
  on public.student_progress_reports(school_id,class_id,term_id,course_id,curriculum_release_id,academic_qa_status);
create index if not exists progression_student_term_idx
  on public.academic_progression_decisions(student_id,academic_term_id,status);

grant select on public.academic_assessment_evidence to authenticated;
grant select on public.academic_progression_decisions to authenticated;
grant execute on function public.evaluate_progress_report_academic_qa(uuid) to authenticated, service_role;

comment on table public.academic_assessment_evidence is
  'Canonical evidence ledger connecting every mark to its learner, class, term, course, official curriculum edition and teaching plan.';
comment on table public.academic_progression_decisions is
  'Human-approved learner continuation and advancement decisions backed by reports and academic evidence.';
