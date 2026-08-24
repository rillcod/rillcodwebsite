-- Written papers use the same explicit result boundary as assignments and CBT.
-- Attempts, answers, scores and moderation are never deleted or recalculated.

create or replace function public.apply_written_exam_result_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result_eligible boolean;
begin
  select case
      when metadata ->> 'result_eligible' = 'false' then false
      when class_id is null and coalesce(metadata ->> 'assessment_scope', '') = '' then false
      else true
    end
    into v_result_eligible
  from public.exams
  where id = new.exam_id;

  update public.academic_assessment_evidence
  set evidence_status = case
        when not coalesce(v_result_eligible, false) then 'recorded'
        when new.moderation_status = 'approved' then 'moderated'
        when new.status = 'graded' or new.submitted_at is not null then 'graded'
        when new.status = 'submitted' then 'submitted'
        else 'draft'
      end,
      updated_at = now()
  where evidence_type = 'exam_attempt' and source_id = new.id;
  return new;
end;
$$;

drop trigger if exists zz_apply_written_exam_result_eligibility on public.exam_attempts;
drop trigger if exists zzz_apply_written_exam_result_eligibility on public.exam_attempts;
create trigger zzz_apply_written_exam_result_eligibility
after insert or update of status, score, total_points, percentage, submitted_at, moderation_status
on public.exam_attempts
for each row execute function public.apply_written_exam_result_eligibility();

create or replace function public.refresh_written_exam_result_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.academic_assessment_evidence e
  set evidence_status = case
        when coalesce(new.metadata ->> 'result_eligible', 'false') = 'false' then 'recorded'
        when a.moderation_status = 'approved' then 'moderated'
        when a.status = 'graded' or a.submitted_at is not null then 'graded'
        when a.status = 'submitted' then 'submitted'
        else 'draft'
      end,
      updated_at = now()
  from public.exam_attempts a
  where e.evidence_type = 'exam_attempt'
    and e.assessment_id = new.id
    and e.source_id = a.id;
  return new;
end;
$$;

drop trigger if exists refresh_written_exam_result_eligibility on public.exams;
create trigger refresh_written_exam_result_eligibility
after update of metadata on public.exams
for each row execute function public.refresh_written_exam_result_eligibility();

-- Explicit practice papers and unresolved legacy papers are retained for staff
-- recovery, but cannot silently enter Auto-fill before their class is verified.
update public.academic_assessment_evidence e
set evidence_status = 'recorded', updated_at = now()
from public.exams x
where e.evidence_type = 'exam_attempt'
  and e.assessment_id = x.id
  and (
    coalesce(x.metadata ->> 'result_eligible', 'true') = 'false'
    or (x.class_id is null and coalesce(x.metadata ->> 'assessment_scope', '') = '')
  );

comment on function public.apply_written_exam_result_eligibility() is
  'Preserves written attempts while keeping practice and unresolved legacy papers outside automatic report calculation.';
