-- Keep every new academic score physically valid, even if a future caller bypasses
-- the application helpers. Existing learner records are deliberately not rewritten;
-- NOT VALID constraints protect all new/changed rows without scanning or mutating
-- historical marks during deployment.

alter table public.cbt_sessions
  drop constraint if exists cbt_sessions_score_range,
  drop constraint if exists cbt_sessions_manual_scores_object;

alter table public.cbt_sessions
  add constraint cbt_sessions_score_range
    check (score is null or (score >= 0 and score <= 100)) not valid,
  add constraint cbt_sessions_manual_scores_object
    check (manual_scores is null or jsonb_typeof(manual_scores) = 'object') not valid;

alter table public.assignment_submissions
  drop constraint if exists assignment_submissions_grade_nonnegative,
  drop constraint if exists assignment_submissions_weighted_score_nonnegative;

alter table public.assignment_submissions
  add constraint assignment_submissions_grade_nonnegative
    check (grade is null or grade >= 0) not valid,
  add constraint assignment_submissions_weighted_score_nonnegative
    check (weighted_score is null or weighted_score >= 0) not valid;

alter table public.exam_attempts
  drop constraint if exists exam_attempts_percentage_range,
  drop constraint if exists exam_attempts_score_nonnegative,
  drop constraint if exists exam_attempts_total_points_nonnegative;

alter table public.exam_attempts
  add constraint exam_attempts_percentage_range
    check (percentage is null or (percentage >= 0 and percentage <= 100)) not valid,
  add constraint exam_attempts_score_nonnegative
    check (score is null or score >= 0) not valid,
  add constraint exam_attempts_total_points_nonnegative
    check (total_points is null or total_points >= 0) not valid;

create or replace function public.validate_assignment_submission_grade_ceiling()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max_points numeric;
begin
  if new.grade is null then
    return new;
  end if;

  select greatest(coalesce(a.max_points, 100), 0)
    into v_max_points
  from public.assignments a
  where a.id = new.assignment_id;

  if v_max_points is null then
    raise exception 'Assignment % is unavailable for score validation', new.assignment_id
      using errcode = '23503';
  end if;
  if new.grade < 0 or new.grade > v_max_points then
    raise exception 'Assignment grade % must be between 0 and %', new.grade, v_max_points
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_assignment_submission_grade_ceiling on public.assignment_submissions;
create trigger validate_assignment_submission_grade_ceiling
before insert or update of grade, assignment_id on public.assignment_submissions
for each row execute function public.validate_assignment_submission_grade_ceiling();

-- Assignment totals have a per-assignment ceiling, which a CHECK constraint cannot
-- read. Extend the existing lifecycle trigger so a direct database/API update cannot
-- store a mark above that assignment's configured maximum.
create or replace function public.guard_assignment_submission_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_allowed boolean := false;
begin
  if new.status is distinct from old.status then
    v_allowed := case coalesce(old.status, 'draft')
      when 'draft' then new.status in ('submitted', 'late', 'missing')
      when 'submitted' then new.status in ('pending_review', 'under_review', 'returned_for_revision', 'graded', 'missing')
      when 'late' then new.status in ('pending_review', 'under_review', 'returned_for_revision', 'graded', 'missing')
      when 'pending_review' then new.status in ('under_review', 'returned_for_revision', 'graded', 'missing')
      when 'under_review' then new.status in ('returned_for_revision', 'graded', 'missing')
      when 'returned_for_revision' then new.status in ('resubmitted', 'submitted', 'late', 'missing')
      when 'resubmitted' then new.status in ('pending_review', 'under_review', 'returned_for_revision', 'graded', 'missing')
      when 'graded' then new.status in ('submitted', 'pending_review', 'returned_for_revision', 'moderated', 'published')
      when 'moderated' then new.status in ('graded', 'published')
      when 'published' then new.status in ('graded', 'moderated')
      when 'missing' then new.status in ('submitted', 'late', 'resubmitted')
      else false
    end;
    if not v_allowed then
      raise exception 'Invalid submission transition from % to %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  if row(
    new.status, new.grade, new.weighted_score, new.feedback,
    new.grading_details, new.graded_by, new.graded_at
  ) is distinct from row(
    old.status, old.grade, old.weighted_score, old.feedback,
    old.grading_details, old.graded_by, old.graded_at
  ) then
    new.version := old.version + 1;
    new.status_changed_at := now();
  end if;

  return new;
end;
$$;

comment on constraint cbt_sessions_score_range on public.cbt_sessions is
  'Rejects new invalid CBT percentages without rewriting historical evidence.';
comment on function public.guard_assignment_submission_transition() is
  'Enforces assignment review transitions and monotonic versions.';
comment on function public.validate_assignment_submission_grade_ceiling() is
  'Rejects assignment marks above the assignment maximum on both insert and update.';
