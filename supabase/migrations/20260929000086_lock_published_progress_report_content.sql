-- A published result is a family-visible academic record. Corrections must use
-- the explicit Publish & Share -> Unpublish -> Write -> Publish cycle. This
-- database guard prevents stale tabs, service-role scripts, or future routes
-- from silently changing academic content while the report remains live.

create or replace function public.guard_published_progress_report_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_published is true and (
    new.student_id is distinct from old.student_id
    or new.student_name is distinct from old.student_name
    or new.school_id is distinct from old.school_id
    or new.school_name is distinct from old.school_name
    or new.class_id is distinct from old.class_id
    or new.section_class is distinct from old.section_class
    or new.student_grade is distinct from old.student_grade
    or new.course_id is distinct from old.course_id
    or new.course_name is distinct from old.course_name
    or new.term_id is distinct from old.term_id
    or new.report_term is distinct from old.report_term
    or new.report_period is distinct from old.report_period
    or new.report_date is distinct from old.report_date
    or new.instructor_name is distinct from old.instructor_name
    or new.calculation_mode is distinct from old.calculation_mode
    or new.theory_score is distinct from old.theory_score
    or new.practical_score is distinct from old.practical_score
    or new.attendance_score is distinct from old.attendance_score
    or new.participation_score is distinct from old.participation_score
    or new.engagement_metrics is distinct from old.engagement_metrics
    or new.overall_score is distinct from old.overall_score
    or new.overall_grade is distinct from old.overall_grade
    or new.participation_grade is distinct from old.participation_grade
    or new.projects_grade is distinct from old.projects_grade
    or new.homework_grade is distinct from old.homework_grade
    or new.key_strengths is distinct from old.key_strengths
    or new.areas_for_growth is distinct from old.areas_for_growth
    or new.proficiency_level is distinct from old.proficiency_level
    or new.current_module is distinct from old.current_module
    or new.next_module is distinct from old.next_module
    or new.learning_milestones is distinct from old.learning_milestones
    or new.course_duration is distinct from old.course_duration
    or new.course_completed is distinct from old.course_completed
    or new.has_certificate is distinct from old.has_certificate
    or new.certificate_text is distinct from old.certificate_text
  ) then
    raise exception using
      errcode = '23514',
      message = 'Published report content is locked.',
      hint = 'Unpublish the report in Publish & Share, make the correction in Write, then publish the same report again.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_published_progress_report_content
  on public.student_progress_reports;
create trigger guard_published_progress_report_content
before update on public.student_progress_reports
for each row execute function public.guard_published_progress_report_content();

comment on function public.guard_published_progress_report_content() is
  'Keeps published academic report content immutable until an explicit unpublish transition unlocks the same canonical row.';
