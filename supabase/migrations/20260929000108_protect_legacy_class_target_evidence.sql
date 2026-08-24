-- Older assessment rows may have an exact target class only in metadata. Keep
-- that evidence protected while staff resolve it into the canonical class_id.

create or replace function public.prevent_legacy_class_target_evidence_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
      select 1 from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      where a.class_id is null
        and a.metadata ->> 'target_class_id' = old.id::text
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
      where x.class_id is null and x.metadata ->> 'target_class_id' = old.id::text
    )
    or exists (
      select 1 from public.exam_attempts a
      join public.exams x on x.id = a.exam_id
      where x.class_id is null and x.metadata ->> 'target_class_id' = old.id::text
    )
  then
    raise exception using errcode = 'P0001', message = 'PROTECTED_ACADEMIC_EVIDENCE';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_legacy_class_target_evidence_delete on public.classes;
create trigger prevent_legacy_class_target_evidence_delete
before delete on public.classes
for each row execute function public.prevent_legacy_class_target_evidence_delete();

comment on function public.prevent_legacy_class_target_evidence_delete() is
  'Prevents class deletion from orphaning learner work whose exact legacy target survives only in assessment metadata.';
