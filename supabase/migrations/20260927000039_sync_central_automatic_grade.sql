-- Keep the displayed grade in the same central automatic calculation path.
-- Manual reports retain their manually chosen grade.

create or replace function public.sync_central_automatic_grade()
returns trigger language plpgsql set search_path=public as $$
declare v_score numeric;
begin
  if new.calculation_mode='automatic' and new.overall_score is not null then
    v_score:=greatest(0,least(100,round(new.overall_score)));
    new.overall_grade:=case
      when v_score>=75 then 'A1'
      when v_score>=70 then 'B2'
      when v_score>=65 then 'B3'
      when v_score>=60 then 'C4'
      when v_score>=55 then 'C5'
      when v_score>=50 then 'C6'
      when v_score>=45 then 'D7'
      when v_score>=40 then 'E8'
      else 'F9'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_central_automatic_grade on public.student_progress_reports;
create trigger sync_central_automatic_grade
before insert or update of overall_score,calculation_mode
on public.student_progress_reports for each row execute function public.sync_central_automatic_grade();

comment on function public.sync_central_automatic_grade() is
  'Applies the platform WAEC-aligned grade bands only to centrally calculated automatic results; manual grades are untouched.';
