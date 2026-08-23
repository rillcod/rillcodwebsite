-- Atomic, scoped curriculum-level decisions. This does not control class-grade
-- promotion and never rewrites reports, submissions, marks, or learner scores.

create table if not exists public.student_level_decision_audit (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references public.student_level_enrollments(id) on delete set null,
  resulting_enrollment_id uuid references public.student_level_enrollments(id) on delete set null,
  student_id uuid not null references public.portal_users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  resulting_course_id uuid references public.courses(id) on delete set null,
  decision text not null check (decision in ('promote', 'repeat', 'complete', 'withdraw')),
  previous_status text not null,
  resulting_status text not null,
  previous_term_label text not null,
  resulting_term_label text,
  actor_id uuid references public.portal_users(id) on delete set null,
  actor_role text,
  teacher_notes text,
  created_at timestamptz not null default now()
);

create index if not exists student_level_decision_audit_student_created_idx
  on public.student_level_decision_audit (student_id, created_at desc);
create index if not exists student_level_decision_audit_school_created_idx
  on public.student_level_decision_audit (school_id, created_at desc);

alter table public.student_level_decision_audit enable row level security;

drop policy if exists student_level_decision_audit_staff_read on public.student_level_decision_audit;
create policy student_level_decision_audit_staff_read
  on public.student_level_decision_audit
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_users actor
      where actor.id = auth.uid()
        and actor.is_active is true
        and coalesce(actor.is_deleted, false) is false
        and (
          actor.role = 'admin'
          or actor.id = student_level_decision_audit.actor_id
          or (
            actor.role in ('teacher', 'school')
            and actor.school_id is not null
            and actor.school_id = student_level_decision_audit.school_id
          )
          or exists (
            select 1 from public.teacher_schools ts
            where ts.teacher_id = actor.id
              and ts.school_id = student_level_decision_audit.school_id
          )
        )
    )
  );

revoke all on table public.student_level_decision_audit from anon;
revoke insert, update, delete on table public.student_level_decision_audit from authenticated;
grant select on table public.student_level_decision_audit to authenticated;
grant all on table public.student_level_decision_audit to service_role;

create or replace function public.process_student_level_decision(
  p_enrollment_id uuid,
  p_decision text,
  p_next_term_label text,
  p_actor_id uuid,
  p_teacher_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.portal_users%rowtype;
  v_enrollment public.student_level_enrollments%rowtype;
  v_course public.courses%rowtype;
  v_effective_school uuid;
  v_next_course uuid;
  v_new_enrollment public.student_level_enrollments%rowtype;
  v_resulting_status text;
  v_resulting_term text;
begin
  if p_decision not in ('promote', 'repeat', 'complete', 'withdraw') then
    raise exception 'Invalid curriculum decision';
  end if;
  if p_decision in ('promote', 'repeat') and nullif(trim(p_next_term_label), '') is null then
    raise exception 'The next term is required for this decision';
  end if;

  select * into v_actor
  from public.portal_users
  where id = p_actor_id
    and is_active is true
    and coalesce(is_deleted, false) is false;
  if not found or v_actor.role not in ('admin', 'teacher') then
    raise exception 'Only an active teacher or administrator can record this decision';
  end if;

  select * into v_enrollment
  from public.student_level_enrollments
  where id = p_enrollment_id
  for update;
  if not found then raise exception 'Enrollment not found'; end if;
  if v_enrollment.status <> 'active' then
    raise exception 'This curriculum enrollment is no longer active';
  end if;

  select * into v_course from public.courses where id = v_enrollment.course_id;
  v_effective_school := coalesce(v_enrollment.school_id, v_course.school_id);

  if v_actor.role <> 'admin' and not (
    (v_effective_school is not null and v_actor.school_id = v_effective_school)
    or exists (
      select 1 from public.teacher_schools ts
      where ts.teacher_id = p_actor_id and ts.school_id = v_effective_school
    )
    or exists (
      select 1
      from public.portal_users learner
      join public.classes c on c.id = learner.class_id
      where learner.id = v_enrollment.student_id and c.teacher_id = p_actor_id
    )
  ) then
    raise exception 'You cannot change this learner curriculum path';
  end if;

  if p_decision = 'withdraw' then
    update public.student_level_enrollments
    set status = 'withdrawn', updated_at = now()
    where id = v_enrollment.id;
    v_resulting_status := 'withdrawn';
    v_resulting_term := v_enrollment.term_label;
  elsif p_decision = 'complete' then
    update public.student_level_enrollments
    set status = 'completed', updated_at = now()
    where id = v_enrollment.id;
    v_resulting_status := 'completed';
    v_resulting_term := v_enrollment.term_label;
  else
    v_next_course := case when p_decision = 'promote' then v_course.next_course_id else v_enrollment.course_id end;
    if p_decision = 'promote' and v_next_course is null then
      update public.student_level_enrollments
      set status = 'completed', promoted_to = null, updated_at = now()
      where id = v_enrollment.id;
      v_resulting_status := 'completed';
      v_resulting_term := v_enrollment.term_label;
    else
      select * into v_new_enrollment
      from public.student_level_enrollments
      where student_id = v_enrollment.student_id
        and course_id = v_next_course
        and term_label = trim(p_next_term_label)
        and status = 'active'
      limit 1;

      if v_new_enrollment.id is null then
        insert into public.student_level_enrollments (
          student_id, course_id, school_id, program_id, cohort_year,
          term_label, start_week, status
        ) values (
          v_enrollment.student_id, v_next_course, v_enrollment.school_id,
          v_enrollment.program_id, v_enrollment.cohort_year,
          trim(p_next_term_label), 1, 'active'
        ) returning * into v_new_enrollment;
      end if;

      update public.student_level_enrollments
      set status = case when p_decision = 'promote' then 'promoted' else 'repeated' end,
          promoted_to = case when p_decision = 'promote' then v_next_course else null end,
          updated_at = now()
      where id = v_enrollment.id;
      v_resulting_status := v_new_enrollment.status;
      v_resulting_term := v_new_enrollment.term_label;
    end if;
  end if;

  insert into public.student_level_decision_audit (
    enrollment_id, resulting_enrollment_id, student_id, school_id,
    course_id, resulting_course_id, decision, previous_status,
    resulting_status, previous_term_label, resulting_term_label,
    actor_id, actor_role, teacher_notes
  ) values (
    v_enrollment.id, v_new_enrollment.id, v_enrollment.student_id,
    v_effective_school, v_enrollment.course_id, v_new_enrollment.course_id,
    p_decision, v_enrollment.status, v_resulting_status,
    v_enrollment.term_label, v_resulting_term, v_actor.id, v_actor.role,
    nullif(trim(p_teacher_notes), '')
  );

  return jsonb_build_object(
    'decision', p_decision,
    'enrollment_id', v_enrollment.id,
    'resulting_enrollment_id', v_new_enrollment.id,
    'resulting_status', v_resulting_status,
    'resulting_term_label', v_resulting_term,
    'resulting_course_id', v_new_enrollment.course_id
  );
end;
$$;

revoke all on function public.process_student_level_decision(uuid, text, text, uuid, text) from public;
grant execute on function public.process_student_level_decision(uuid, text, text, uuid, text) to service_role;

comment on function public.process_student_level_decision(uuid, text, text, uuid, text) is
  'Atomically records a manual curriculum-level decision after actor scope validation; never changes class placement or academic scores.';
