-- One review lifecycle for homework, projects, quizzes and other assignment evidence.
-- Existing statuses remain valid; the richer states are additive so active schools are
-- not forced into a stricter workflow while configuration is still evolving.

alter table public.assignment_submissions
  drop constraint if exists assignment_submissions_status_check;

alter table public.assignment_submissions
  add constraint assignment_submissions_status_check
  check (status in (
    'draft', 'submitted', 'late', 'pending_review', 'under_review',
    'returned_for_revision', 'resubmitted', 'graded', 'moderated',
    'published', 'missing'
  ));

alter table public.assignment_submissions
  add column if not exists version integer not null default 1,
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists status_changed_by uuid,
  add column if not exists last_change_reason text;

alter table public.assignment_submissions
  drop constraint if exists assignment_submissions_version_positive;

alter table public.assignment_submissions
  add constraint assignment_submissions_version_positive check (version > 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assignment_submissions_status_changed_by_fkey'
      and conrelid = 'public.assignment_submissions'::regclass
  ) then
    alter table public.assignment_submissions
      add constraint assignment_submissions_status_changed_by_fkey
      foreign key (status_changed_by) references public.portal_users(id) on delete set null;
  end if;
end;
$$;

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

drop trigger if exists guard_assignment_submission_transition on public.assignment_submissions;
create trigger guard_assignment_submission_transition
before update on public.assignment_submissions
for each row execute function public.guard_assignment_submission_transition();

comment on column public.assignment_submissions.version is
  'Monotonic review version used to detect stale grading edits without blocking legacy clients.';
comment on column public.assignment_submissions.last_change_reason is
  'Human-readable reason for the latest review, return, moderation or score correction.';
comment on function public.guard_assignment_submission_transition() is
  'Enforces the shared assignment/project evidence lifecycle and increments its review version.';
