-- No score may be entered for a term that has not started.
--
-- 20260929000034 allowed a 60-day head start, on the evidence that 557 Third
-- Term reports had been written about a month before that term's start_date.
-- After the realignment that evidence no longer holds: every one of the 869
-- reports now sits inside a term that had already begun on its report date, so
-- the allowance protects nothing and leaves a 60-day window in which next
-- session's marks can still be recorded.
--
-- The rule is now absolute, in both directions:
--   * the term must have STARTED on or before the report's date, and
--   * the term must have started on or before TODAY.
--
-- The second clause matters on its own. Without it a report back-dated into a
-- started term could still be filed against a session that has not opened —
-- the report date would pass while the term itself is still in the future.

create or replace function public.guard_report_session_not_far_future()
returns trigger language plpgsql as $$
declare v_start date; v_label text; v_year text; v_when date;
begin
  if new.term_id is null then return new; end if;

  select start_date, term_label, academic_year
    into v_start, v_label, v_year
  from public.academic_terms where id = new.term_id;

  if v_start is null then return new; end if;
  v_when := coalesce(new.report_date, current_date);

  if v_start > current_date then
    raise exception
      'Cannot record a score for % % — that term has not started (it begins %).',
      v_label, v_year, v_start
      using hint = 'Choose the session that is currently running.';
  end if;

  if v_start > v_when then
    raise exception
      'This report is dated % but % % does not begin until %.',
      v_when, v_label, v_year, v_start
      using hint = 'Check the academic year on the report — the term may be right but the session is ahead.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_report_session_not_far_future on public.student_progress_reports;
create trigger guard_report_session_not_far_future
  before insert or update of term_id, report_date
  on public.student_progress_reports
  for each row execute function public.guard_report_session_not_far_future();

comment on function public.guard_report_session_not_far_future() is
  'A progress report may only belong to a term that has already started, judged against both the report date and today. Replaces the earlier 60-day allowance, which no live report needs.';
