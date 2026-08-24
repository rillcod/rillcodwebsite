-- Assignment submissions may be useful practice without being official report
-- evidence. Preserve every submission and mark, but keep the result boundary
-- explicit and reversible through the parent assignment setting.

create or replace function public.apply_assignment_result_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result_eligible boolean;
begin
  select case when metadata ->> 'result_eligible' = 'false' then false else true end
    into v_result_eligible
  from public.assignments
  where id = new.assignment_id;

  update public.academic_assessment_evidence
  set evidence_status = case
        when not coalesce(v_result_eligible, true) then 'recorded'
        when new.status = 'graded' then 'graded'
        when new.status = 'submitted' then 'submitted'
        else 'draft'
      end,
      updated_at = now()
  where evidence_type = 'assignment_submission' and source_id = new.id;
  return new;
end;
$$;

drop trigger if exists zz_apply_assignment_result_eligibility on public.assignment_submissions;
create trigger zz_apply_assignment_result_eligibility
after insert or update of status, grade, weighted_score, graded_at, graded_by, grading_mode
on public.assignment_submissions
for each row execute function public.apply_assignment_result_eligibility();

create or replace function public.refresh_assignment_result_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.academic_assessment_evidence e
  set evidence_status = case
        when coalesce(new.metadata ->> 'result_eligible', 'true') = 'false' then 'recorded'
        when s.status = 'graded' then 'graded'
        when s.status = 'submitted' then 'submitted'
        else 'draft'
      end,
      updated_at = now()
  from public.assignment_submissions s
  where e.evidence_type = 'assignment_submission'
    and e.assessment_id = new.id
    and e.source_id = s.id;
  return new;
end;
$$;

drop trigger if exists refresh_assignment_result_eligibility on public.assignments;
create trigger refresh_assignment_result_eligibility
after update of metadata on public.assignments
for each row execute function public.refresh_assignment_result_eligibility();

-- Normalize explicit choices only. Older unscoped assignments with no decision
-- remain visible to the audit and staff recovery UI rather than being guessed.
update public.academic_assessment_evidence e
set evidence_status = 'recorded', updated_at = now()
from public.assignments a
where e.evidence_type = 'assignment_submission'
  and e.assessment_id = a.id
  and coalesce(a.metadata ->> 'result_eligible', 'true') = 'false';

comment on function public.apply_assignment_result_eligibility() is
  'Keeps practice submissions available for feedback while excluding them from automatic report calculation.';
