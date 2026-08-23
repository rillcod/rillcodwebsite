-- Keep class cleanup usable during product development without allowing a class
-- delete to cascade away learner attempts or leave students half-detached.
create or replace function public.delete_rebuildable_class(
  p_class_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_actor public.portal_users%rowtype;
  v_detached_students integer := 0;
begin
  select * into v_actor from public.portal_users where id=p_actor_id;
  if v_actor.id is null or v_actor.role not in ('admin','teacher')
     or coalesce(v_actor.is_active,false)=false or coalesce(v_actor.is_deleted,false)=true then
    raise exception using errcode='42501', message='ACTOR_NOT_ALLOWED';
  end if;

  select * into v_class from public.classes where id=p_class_id for update;
  if v_class.id is null then
    raise exception using errcode='P0002', message='CLASS_NOT_FOUND';
  end if;

  if v_actor.role='teacher'
     and coalesce(v_actor.school_id, '00000000-0000-0000-0000-000000000000'::uuid)
       <> coalesce(v_class.school_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and not exists (
       select 1 from public.teacher_schools ts
       where ts.teacher_id=p_actor_id and ts.school_id=v_class.school_id
     ) then
    raise exception using errcode='42501', message='CLASS_OUT_OF_SCOPE';
  end if;

  if exists (
      select 1 from public.assignment_submissions submission
      join public.assignments assignment on assignment.id=submission.assignment_id
      where assignment.class_id=p_class_id and (
        submission.submitted_at is not null
        or nullif(btrim(coalesce(submission.submission_text,'')), '') is not null
        or submission.file_url is not null
        or submission.grade is not null
        or submission.weighted_score is not null
        or submission.graded_at is not null
        or submission.graded_by is not null
        or submission.grading_mode='manual'
        or submission.status in ('submitted','graded','returned','approved')
        or coalesce(submission.answers,'{}'::jsonb) <> '{}'::jsonb
      )
    )
    or exists (
      select 1 from public.cbt_sessions session
      join public.cbt_exams exam on exam.id=session.exam_id
      where exam.class_id=p_class_id
    )
    or exists (
      select 1 from public.exam_attempts attempt
      join public.exams exam on exam.id=attempt.exam_id
      where exam.class_id=p_class_id
    )
    or exists (
      select 1 from public.student_progress_reports report
      where report.class_id=p_class_id and (
        coalesce(report.is_published,false)=true
        or report.calculation_mode='manual'
        or report.theory_score is not null
        or report.practical_score is not null
        or report.attendance_score is not null
        or report.participation_score is not null
        or report.overall_score is not null
      )
    )
    or exists (select 1 from public.enrollment_term_grades grade where grade.class_id=p_class_id)
    or exists (select 1 from public.academic_assessment_evidence evidence where evidence.class_id=p_class_id)
  then
    raise exception using errcode='P0001', message='PROTECTED_ACADEMIC_EVIDENCE';
  end if;

  update public.portal_users
  set class_id=null, section_class=null, updated_at=now()
  where class_id=p_class_id and role='student';
  get diagnostics v_detached_students = row_count;

  delete from public.classes where id=p_class_id;

  return jsonb_build_object(
    'deleted_class_id', p_class_id,
    'detached_students', v_detached_students
  );
end;
$$;

revoke all on function public.delete_rebuildable_class(uuid,uuid) from public, anon, authenticated;
grant execute on function public.delete_rebuildable_class(uuid,uuid) to service_role;

comment on function public.delete_rebuildable_class(uuid,uuid) is
  'Atomically deletes a rebuildable class and clears its roster labels, but refuses when learner submissions, attempts, manual scores, reports, term grades, or assessment evidence exist.';
