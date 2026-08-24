-- Application cleanup may remove empty, rebuildable programme definitions, but
-- no direct SQL path may cascade or orphan submitted learner evidence.

create or replace function public.prevent_programme_evidence_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
      select 1
      from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      left join public.courses c on c.id = a.course_id
      where (a.program_id = old.id or c.program_id = old.id)
        and (
          s.submitted_at is not null
          or nullif(btrim(coalesce(s.submission_text, '')), '') is not null
          or s.file_url is not null
          or s.grade is not null
          or s.weighted_score is not null
          or s.graded_at is not null
          or s.graded_by is not null
          or s.grading_mode = 'manual'
          or s.status in ('submitted', 'graded', 'returned', 'approved')
          or coalesce(s.answers, '{}'::jsonb) <> '{}'::jsonb
        )
    )
    or exists (
      select 1 from public.cbt_sessions s
      join public.cbt_exams x on x.id = s.exam_id
      left join public.courses c on c.id = x.course_id
      where x.program_id = old.id or c.program_id = old.id
    )
    or exists (
      select 1 from public.exam_attempts a
      join public.exams x on x.id = a.exam_id
      left join public.courses c on c.id = x.course_id
      where x.program_id = old.id or c.program_id = old.id
    )
    or exists (
      select 1 from public.student_progress_reports r
      left join public.courses c on c.id = r.course_id
      where (r.program_id = old.id or c.program_id = old.id)
        and (
          coalesce(r.is_published, false) = true
          or r.calculation_mode = 'manual'
          or r.theory_score is not null
          or r.practical_score is not null
          or r.attendance_score is not null
          or r.participation_score is not null
          or r.overall_score is not null
        )
    )
    or exists (
      select 1 from public.enrollment_term_grades g
      left join public.enrollments e on e.id = g.enrollment_id
      left join public.courses c on c.id = g.course_id
      where e.program_id = old.id or c.program_id = old.id
    )
    or exists (
      select 1 from public.academic_assessment_evidence e
      left join public.courses c on c.id = e.course_id
      left join public.classes x on x.id = e.class_id
      where c.program_id = old.id or x.program_id = old.id
    )
  then
    raise exception using errcode = 'P0001', message = 'PROTECTED_PROGRAMME_EVIDENCE';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_programme_evidence_delete on public.programs;
create trigger prevent_programme_evidence_delete
before delete on public.programs
for each row execute function public.prevent_programme_evidence_delete();

comment on function public.prevent_programme_evidence_delete() is
  'Database backstop that prevents programme deletion when submissions, attempts, scored reports, moderated grades, or central assessment evidence survive.';
