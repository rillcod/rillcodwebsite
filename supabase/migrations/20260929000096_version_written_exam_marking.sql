-- Give uploaded/written exam attempts the same marking, correction and moderation
-- guarantees as CBT sessions, then project them into central academic evidence.

alter table public.exam_attempts
  add column if not exists grading_version integer not null default 1,
  add column if not exists grading_changed_at timestamptz,
  add column if not exists grading_changed_by uuid,
  add column if not exists grading_change_reason text,
  add column if not exists moderation_status text not null default 'unreviewed';

alter table public.exam_attempts
  drop constraint if exists exam_attempts_grading_version_positive,
  drop constraint if exists exam_attempts_moderation_status_check,
  drop constraint if exists exam_attempts_approved_is_graded;

alter table public.exam_attempts
  add constraint exam_attempts_grading_version_positive check (grading_version > 0),
  add constraint exam_attempts_moderation_status_check
    check (moderation_status in ('unreviewed', 'reviewed', 'approved', 'returned')),
  add constraint exam_attempts_approved_is_graded
    check (moderation_status <> 'approved' or status = 'graded');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_attempts_grading_changed_by_fkey'
      and conrelid = 'public.exam_attempts'::regclass
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_grading_changed_by_fkey
      foreign key (grading_changed_by) references public.portal_users(id) on delete set null;
  end if;
end;
$$;

create or replace function public.version_written_exam_marking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(new.score, new.total_points, new.percentage, new.status, new.answers, new.moderation_status)
    is distinct from
    row(old.score, old.total_points, old.percentage, old.status, old.answers, old.moderation_status)
  then
    new.grading_version := old.grading_version + 1;
    new.grading_changed_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.sync_written_exam_review_to_academic_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.academic_assessment_evidence evidence
  set evidence_status = case
        when new.moderation_status = 'approved' then 'moderated'
        when new.status = 'graded' then 'graded'
        when new.status = 'submitted' then 'submitted'
        else 'draft'
      end,
      evidence_snapshot = coalesce(evidence.evidence_snapshot, '{}'::jsonb) || jsonb_build_object(
        'attempt_status', new.status,
        'moderation_status', new.moderation_status,
        'grading_version', new.grading_version,
        'change_reason', new.grading_change_reason
      ),
      graded_by = new.grading_changed_by,
      graded_at = coalesce(new.grading_changed_at, new.submitted_at),
      updated_at = now()
  where evidence.evidence_type = 'exam_attempt'
    and evidence.source_id = new.id;
  return new;
end;
$$;

drop trigger if exists version_written_exam_marking on public.exam_attempts;
create trigger version_written_exam_marking
before update on public.exam_attempts
for each row execute function public.version_written_exam_marking();

drop trigger if exists zz_sync_written_exam_review_to_evidence on public.exam_attempts;
create trigger zz_sync_written_exam_review_to_evidence
after insert or update on public.exam_attempts
for each row execute function public.sync_written_exam_review_to_academic_evidence();

-- Replay evidence metadata only; recorded marks and answers are unchanged.
update public.exam_attempts set score = score;
