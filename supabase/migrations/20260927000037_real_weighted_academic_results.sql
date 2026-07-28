-- Real weighted results. Automatic calculations are opt-in per report and use
-- only recorded CBT, assignment, practical and attendance evidence. Manual
-- reports and manually entered marks are never recalculated by these functions.

alter table public.student_progress_reports
  add column if not exists calculation_mode text not null default 'manual'
    check (calculation_mode in ('manual','automatic','hybrid')),
  add column if not exists calculation_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists calculated_at timestamptz;

create table if not exists public.academic_assessment_schemes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_id uuid references public.schools(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  academic_term_id uuid references public.academic_terms(id) on delete cascade,
  components jsonb not null,
  status text not null default 'active' check (status in ('draft','active','archived')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists academic_assessment_scheme_scope_active
on public.academic_assessment_schemes(
  coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(course_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(academic_term_id,'00000000-0000-0000-0000-000000000000'::uuid)
) where status='active';

create table if not exists public.academic_result_components (
  id uuid primary key default gen_random_uuid(),
  progress_report_id uuid not null references public.student_progress_reports(id) on delete cascade,
  component_key text not null check (component_key in (
    'theory','classwork','practical','assignments','attendance','assessment'
  )),
  component_label text not null,
  weight numeric(5,2) not null check (weight between 0 and 100),
  raw_score numeric(5,2),
  weighted_score numeric(5,2),
  evidence_count integer not null default 0,
  evidence_ids uuid[] not null default '{}',
  source_summary jsonb not null default '{}'::jsonb,
  evidence_missing boolean not null default true,
  calculated_at timestamptz not null default now(),
  unique(progress_report_id,component_key)
);

create or replace function public.validate_academic_assessment_scheme()
returns trigger language plpgsql set search_path=public as $$
declare
  v_key text;
  v_total numeric := 0;
  v_required text[] := array['theory','classwork','practical','assignments','attendance','assessment'];
begin
  if jsonb_typeof(new.components) <> 'object' then
    raise exception 'Assessment weights must be supplied as named components.';
  end if;
  foreach v_key in array v_required loop
    if not (new.components ? v_key) then
      raise exception 'Assessment scheme is missing the % component.', v_key;
    end if;
    if jsonb_typeof(new.components->v_key) <> 'number' then
      raise exception 'The % weight must be a number.', v_key;
    end if;
    if (new.components->>v_key)::numeric < 0 or (new.components->>v_key)::numeric > 100 then
      raise exception 'The % weight must be between 0 and 100.', v_key;
    end if;
    v_total := v_total + (new.components->>v_key)::numeric;
  end loop;
  if v_total <> 100 then
    raise exception using message='Assessment weights must total exactly 100%.',
      detail='Current total: '||v_total||'%';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_academic_assessment_scheme on public.academic_assessment_schemes;
create trigger validate_academic_assessment_scheme before insert or update of components,status
on public.academic_assessment_schemes for each row execute function public.validate_academic_assessment_scheme();

insert into public.academic_assessment_schemes(name,components,status)
values ('Rillcod balanced evidence model',jsonb_build_object(
  'theory',20,'classwork',10,'practical',25,'assignments',20,'attendance',10,'assessment',15
),'active')
on conflict do nothing;

create or replace function public.sync_weekly_practical_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan public.lesson_plans%rowtype;
begin
  select * into v_plan from public.lesson_plans where id=new.lesson_plan_id;
  insert into public.academic_assessment_evidence(
    evidence_type,source_id,student_id,school_id,class_id,course_id,academic_term_id,
    curriculum_release_id,lesson_plan_id,curriculum_year_number,curriculum_term_number,
    curriculum_week_number,raw_score,maximum_score,percentage,evidence_status,graded_by,
    graded_at,evidence_snapshot,updated_at
  ) values (
    'weekly_practical',new.id,new.student_id,new.school_id,new.class_id,new.course_id,v_plan.term_id,
    v_plan.curriculum_release_id,new.lesson_plan_id,new.year_number,new.term_number,new.week_number,
    new.practical_score,100,new.practical_score,case when new.completed then 'graded' else 'recorded' end,
    new.recorded_by,new.updated_at,jsonb_build_object('completed',new.completed,
      'completion_seconds',new.completion_seconds,'retry_count',new.retry_count),now()
  ) on conflict(evidence_type,source_id) do update set
    raw_score=excluded.raw_score,percentage=excluded.percentage,
    evidence_status=excluded.evidence_status,graded_by=excluded.graded_by,
    graded_at=excluded.graded_at,evidence_snapshot=excluded.evidence_snapshot,updated_at=now();
  return new;
end;
$$;

drop trigger if exists sync_weekly_practical_evidence on public.curriculum_week_performance;
create trigger sync_weekly_practical_evidence after insert or update
on public.curriculum_week_performance for each row execute function public.sync_weekly_practical_evidence();

insert into public.academic_assessment_evidence(
  evidence_type,source_id,student_id,school_id,class_id,course_id,academic_term_id,
  curriculum_release_id,lesson_plan_id,curriculum_year_number,curriculum_term_number,
  curriculum_week_number,raw_score,maximum_score,percentage,evidence_status,graded_by,
  graded_at,evidence_snapshot
)
select 'weekly_practical',w.id,w.student_id,w.school_id,w.class_id,w.course_id,p.term_id,
  p.curriculum_release_id,w.lesson_plan_id,w.year_number,w.term_number,w.week_number,
  w.practical_score,100,w.practical_score,case when w.completed then 'graded' else 'recorded' end,
  w.recorded_by,w.updated_at,jsonb_build_object('completed',w.completed,
    'completion_seconds',w.completion_seconds,'retry_count',w.retry_count)
from public.curriculum_week_performance w join public.lesson_plans p on p.id=w.lesson_plan_id
on conflict(evidence_type,source_id) do nothing;

create or replace function public.recalculate_traceable_progress_report(p_report_id uuid,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r public.student_progress_reports%rowtype;
  scheme public.academic_assessment_schemes%rowtype;
  v_theory numeric; v_classwork numeric; v_practical numeric; v_assignments numeric;
  v_attendance numeric; v_assessment numeric; v_overall numeric := 0;
  n_theory int:=0; n_classwork int:=0; n_practical int:=0; n_assignments int:=0;
  n_attendance int:=0; n_assessment int:=0; n_sessions int:=0;
  ids_theory uuid[]:='{}'; ids_classwork uuid[]:='{}'; ids_practical uuid[]:='{}';
  ids_assignments uuid[]:='{}'; ids_attendance uuid[]:='{}'; ids_assessment uuid[]:='{}';
  w_theory numeric; w_classwork numeric; w_practical numeric; w_assignments numeric;
  w_attendance numeric; w_assessment numeric;
begin
  select * into r from public.student_progress_reports where id=p_report_id for update;
  if r.id is null then raise exception 'Progress report not found.'; end if;
  if r.calculation_mode='manual' then
    raise exception using message='This is a manually entered result and will not be overwritten.',
      hint='Change the report to Automatic only when you want the system to calculate from recorded evidence.';
  end if;
  if r.class_id is null or r.term_id is null or r.course_id is null or r.curriculum_release_id is null then
    raise exception 'Automatic results require class, term, course and official curriculum context.';
  end if;

  select * into scheme from public.academic_assessment_schemes s
  where s.status='active'
    and (s.school_id is null or s.school_id=r.school_id)
    and (s.course_id is null or s.course_id=r.course_id)
    and (s.academic_term_id is null or s.academic_term_id=r.term_id)
  order by (s.school_id is not null)::int+(s.course_id is not null)::int+(s.academic_term_id is not null)::int desc
  limit 1;
  if scheme.id is null then raise exception 'No active assessment weighting scheme is available.'; end if;
  w_theory:=(scheme.components->>'theory')::numeric;
  w_classwork:=(scheme.components->>'classwork')::numeric;
  w_practical:=(scheme.components->>'practical')::numeric;
  w_assignments:=(scheme.components->>'assignments')::numeric;
  w_attendance:=(scheme.components->>'attendance')::numeric;
  w_assessment:=(scheme.components->>'assessment')::numeric;

  select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into v_theory,n_theory,ids_theory
  from public.academic_assessment_evidence e join public.cbt_exams x on x.id=e.assessment_id
  where e.student_id=r.student_id and e.class_id=r.class_id and e.course_id=r.course_id
    and e.academic_term_id=r.term_id and e.evidence_status in ('graded','moderated')
    and coalesce(x.metadata->>'exam_type','examination')<>'evaluation';

  select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into v_assessment,n_assessment,ids_assessment
  from public.academic_assessment_evidence e join public.cbt_exams x on x.id=e.assessment_id
  where e.student_id=r.student_id and e.class_id=r.class_id and e.course_id=r.course_id
    and e.academic_term_id=r.term_id and e.evidence_status in ('graded','moderated')
    and x.metadata->>'exam_type'='evaluation';

  select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into v_classwork,n_classwork,ids_classwork
  from public.academic_assessment_evidence e join public.assignments a on a.id=e.assessment_id
  where e.student_id=r.student_id and e.class_id=r.class_id and e.course_id=r.course_id
    and e.academic_term_id=r.term_id and e.evidence_status in ('graded','moderated')
    and lower(coalesce(a.assignment_type,'')) in ('classwork','homework');

  select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into v_assignments,n_assignments,ids_assignments
  from public.academic_assessment_evidence e join public.assignments a on a.id=e.assessment_id
  where e.student_id=r.student_id and e.class_id=r.class_id and e.course_id=r.course_id
    and e.academic_term_id=r.term_id and e.evidence_status in ('graded','moderated')
    and lower(coalesce(a.assignment_type,'assignment')) not in ('classwork','homework','project','practical');

  select avg(e.percentage),count(*),coalesce(array_agg(e.id),'{}') into v_practical,n_practical,ids_practical
  from public.academic_assessment_evidence e
  left join public.assignments a on a.id=e.assessment_id and e.evidence_type='assignment_submission'
  where e.student_id=r.student_id and e.class_id=r.class_id and e.course_id=r.course_id
    and e.academic_term_id=r.term_id and e.evidence_status in ('graded','moderated')
    and (e.evidence_type='weekly_practical' or lower(coalesce(a.assignment_type,'')) in ('project','practical'));

  select count(*) into n_sessions from public.class_sessions
  where class_id=r.class_id and term_id=r.term_id and is_active=true;
  if n_sessions>0 then
    select count(*),coalesce(array_agg(a.id),'{}') into n_attendance,ids_attendance
    from public.attendance a join public.class_sessions s on s.id=a.session_id
    where a.user_id=r.student_id and s.class_id=r.class_id and s.term_id=r.term_id
      and a.status='present';
    v_attendance:=round((n_attendance::numeric/n_sessions::numeric)*100,2);
  end if;

  delete from public.academic_result_components where progress_report_id=r.id;
  insert into public.academic_result_components(progress_report_id,component_key,component_label,weight,raw_score,weighted_score,evidence_count,evidence_ids,source_summary,evidence_missing)
  values
    (r.id,'theory','Theory / examination',w_theory,v_theory,coalesce(v_theory,0)*w_theory/100,n_theory,ids_theory,'{}',n_theory=0),
    (r.id,'classwork','Classwork',w_classwork,v_classwork,coalesce(v_classwork,0)*w_classwork/100,n_classwork,ids_classwork,'{}',n_classwork=0),
    (r.id,'practical','Practical / project',w_practical,v_practical,coalesce(v_practical,0)*w_practical/100,n_practical,ids_practical,'{}',n_practical=0),
    (r.id,'assignments','Assignments',w_assignments,v_assignments,coalesce(v_assignments,0)*w_assignments/100,n_assignments,ids_assignments,'{}',n_assignments=0),
    (r.id,'attendance','Attendance',w_attendance,v_attendance,coalesce(v_attendance,0)*w_attendance/100,n_attendance,ids_attendance,jsonb_build_object('class_sessions',n_sessions),n_sessions=0),
    (r.id,'assessment','Mid-term assessment',w_assessment,v_assessment,coalesce(v_assessment,0)*w_assessment/100,n_assessment,ids_assessment,'{}',n_assessment=0);

  select round(sum(weighted_score),2) into v_overall from public.academic_result_components where progress_report_id=r.id;
  update public.student_progress_reports set
    theory_score=coalesce(v_theory,0),practical_score=coalesce(v_practical,0),
    attendance_score=coalesce(v_assignments,0),participation_score=coalesce(v_attendance,0),
    overall_score=v_overall,calculated_at=now(),
    calculation_snapshot=jsonb_build_object('scheme_id',scheme.id,'scheme_name',scheme.name,
      'weights',scheme.components,'calculated_by',p_actor_id,'missing_components',
      (select coalesce(jsonb_agg(component_key),'[]'::jsonb) from public.academic_result_components where progress_report_id=r.id and evidence_missing))
  where id=r.id;
  return jsonb_build_object('overall_score',v_overall,'scheme',scheme.name,
    'missing_components',(select coalesce(jsonb_agg(component_key),'[]'::jsonb) from public.academic_result_components where progress_report_id=r.id and evidence_missing));
end;
$$;

create or replace function public.guard_automatic_result_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_missing text[];
begin
  if new.is_published and new.calculation_mode='automatic'
     and (tg_op='INSERT' or old.is_published is distinct from true) then
    select array_agg(component_key) into v_missing from public.academic_result_components
    where progress_report_id=new.id and evidence_missing;
    if coalesce(array_length(v_missing,1),0)>0 then
      raise exception using message='This automatic result is missing real evidence.',
        detail='Missing components: '||array_to_string(v_missing,', '),
        hint='Record the missing assessment or attendance evidence, or keep the report as a manual result.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_automatic_result_evidence on public.student_progress_reports;
create trigger guard_automatic_result_evidence before insert or update of is_published,calculation_mode
on public.student_progress_reports for each row execute function public.guard_automatic_result_evidence();

alter table public.academic_assessment_schemes enable row level security;
alter table public.academic_result_components enable row level security;
create policy assessment_scheme_read on public.academic_assessment_schemes for select
using (school_id is null or public.is_admin() or exists(select 1 from public.portal_users u where u.id=auth.uid() and u.school_id=academic_assessment_schemes.school_id));
create policy assessment_scheme_admin_manage on public.academic_assessment_schemes for all
using(public.is_admin()) with check(public.is_admin());
create policy result_component_scoped_read on public.academic_result_components for select
using(exists(select 1 from public.student_progress_reports r where r.id=academic_result_components.progress_report_id and (
  r.student_id=auth.uid() or public.is_admin()
  or exists(select 1 from public.portal_users u where u.id=auth.uid() and u.role='school' and u.school_id=r.school_id)
  or exists(select 1 from public.classes c where c.id=r.class_id and c.teacher_id=auth.uid())
)));
grant select on public.academic_assessment_schemes,public.academic_result_components to authenticated;
grant execute on function public.recalculate_traceable_progress_report(uuid,uuid) to authenticated,service_role;

create index if not exists result_components_report_idx on public.academic_result_components(progress_report_id,evidence_missing);
create index if not exists assessment_scheme_scope_idx on public.academic_assessment_schemes(school_id,course_id,academic_term_id,status);

comment on function public.recalculate_traceable_progress_report(uuid,uuid) is
  'Calculates only Automatic or Hybrid reports from real recorded evidence. Manual reports and manual scores are never overwritten.';
