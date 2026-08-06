-- A report cannot belong to a session that has barely begun to exist.
--
-- The report builder lets a teacher choose the academic year from five options
-- (academicYearOptions offers current ±2). Picking the row below the right one
-- files the report into the NEXT session — same term label, so the screen looks
-- correct and only the year is wrong.
--
-- Nothing caught it. isStaleAcademicSession is explicit that it only detects a
-- session BEHIND the live calendar: "Future sessions … are NOT stale." So drift
-- backwards was reported and drift forwards was silent. 76 reports went forward
-- — 60 filed six months before their session opened, 16 filed nine months
-- before, 74 of them already published to parents.
--
-- A blunt "the term must have started" rule would be wrong: writing reports in
-- the last weeks of a term is normal here, and 557 Third Term reports were
-- legitimately begun about a month before that term's start_date. The line is
-- drawn where intent stops being plausible.

create or replace function public.guard_report_session_not_far_future()
returns trigger language plpgsql as $$
declare v_start date; v_label text; v_year text;
begin
  if new.term_id is null then return new; end if;

  select start_date, term_label, academic_year
    into v_start, v_label, v_year
  from public.academic_terms where id = new.term_id;

  if v_start is null then return new; end if;

  -- 60 days covers writing up a term that is nearly over, and the ~30-day head
  -- start these reports already show. It does not cover six or nine months.
  if v_start > (coalesce(new.report_date, current_date) + interval '60 days') then
    raise exception
      'This report is dated % but the session chosen (% %) does not start until %.',
      coalesce(new.report_date, current_date), v_label, v_year, v_start
      using hint = 'Check the academic year on the report — the term is right but the session is a year ahead.';
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
  'Refuses a progress report filed into a session starting more than 60 days after the report date. Writing up a term in its final weeks stays allowed; choosing next year''s session from the year dropdown does not.';
