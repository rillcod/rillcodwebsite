-- Keep assignment/project and CBT review states aligned with the single academic
-- evidence authority consumed by result QA and report publication.

alter table public.cbt_sessions
  drop constraint if exists cbt_sessions_approved_marking_complete;

alter table public.cbt_sessions
  add constraint cbt_sessions_approved_marking_complete
  check (moderation_status <> 'approved' or coalesce(needs_grading, false) = false);

create or replace function public.sync_assignment_review_to_academic_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.academic_assessment_evidence evidence
  set evidence_status = case
        when new.status in ('moderated', 'published') then 'moderated'
        when new.status = 'graded' then 'graded'
        when new.status in ('submitted', 'late', 'pending_review', 'under_review', 'returned_for_revision', 'resubmitted') then 'submitted'
        else 'draft'
      end,
      evidence_snapshot = coalesce(evidence.evidence_snapshot, '{}'::jsonb) || jsonb_build_object(
        'submission_status', new.status,
        'review_version', new.version,
        'change_reason', new.last_change_reason,
        'feedback', new.feedback,
        'weighted_score', new.weighted_score
      ),
      graded_by = new.graded_by,
      graded_at = new.graded_at,
      updated_at = now()
  where evidence.evidence_type = 'assignment_submission'
    and evidence.source_id = new.id;
  return new;
end;
$$;

create or replace function public.sync_cbt_review_to_academic_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.academic_assessment_evidence evidence
  set evidence_status = case
        when new.moderation_status = 'approved' then 'moderated'
        when new.status in ('completed', 'passed', 'failed') and coalesce(new.needs_grading, false) = false then 'graded'
        when new.status in ('pending_grading', 'completed', 'passed', 'failed') then 'submitted'
        else 'draft'
      end,
      evidence_snapshot = coalesce(evidence.evidence_snapshot, '{}'::jsonb) || jsonb_build_object(
        'session_status', new.status,
        'needs_grading', new.needs_grading,
        'moderation_status', new.moderation_status,
        'grading_version', new.grading_version,
        'change_reason', new.grading_change_reason
      ),
      graded_by = new.grading_changed_by,
      graded_at = coalesce(new.grading_changed_at, new.end_time),
      updated_at = now()
  where evidence.evidence_type = 'cbt_session'
    and evidence.source_id = new.id;
  return new;
end;
$$;

drop trigger if exists zz_sync_assignment_review_to_evidence on public.assignment_submissions;
create trigger zz_sync_assignment_review_to_evidence
after insert or update on public.assignment_submissions
for each row execute function public.sync_assignment_review_to_academic_evidence();

drop trigger if exists zz_sync_cbt_review_to_evidence on public.cbt_sessions;
create trigger zz_sync_cbt_review_to_evidence
after insert or update on public.cbt_sessions
for each row execute function public.sync_cbt_review_to_academic_evidence();

-- Recompute evidence metadata only. Learner answers and all recorded scores stay untouched.
update public.assignment_submissions set updated_at = updated_at;
update public.cbt_sessions set updated_at = updated_at;

comment on function public.sync_assignment_review_to_academic_evidence() is
  'Maps assignment/project review states into the shared result evidence lifecycle.';
comment on function public.sync_cbt_review_to_academic_evidence() is
  'Maps completed and moderated CBT/manual-paper sittings into the shared result evidence lifecycle.';
