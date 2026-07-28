-- Manual results are a deliberate academic record mode. Automation may read
-- them for QA/publication, but cannot convert or stamp them as calculated.

create or replace function public.protect_manual_result_from_automation()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.calculation_mode='manual' then
    if new.calculation_mode<>'manual' then
      raise exception using message='This manually entered result cannot be converted to automatic calculation.',
        hint='Create a separate future result period if automatic calculation is required.';
    end if;
    if new.calculation_snapshot is distinct from old.calculation_snapshot
      or new.calculated_at is distinct from old.calculated_at then
      raise exception using message='Automatic calculation metadata cannot be written to a manual result.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_manual_result_from_automation on public.student_progress_reports;
create trigger protect_manual_result_from_automation
before update of calculation_mode,calculation_snapshot,calculated_at
on public.student_progress_reports for each row execute function public.protect_manual_result_from_automation();

comment on function public.protect_manual_result_from_automation() is
  'Database-level guarantee that an existing manual result cannot be converted or stamped by an automatic calculator.';
