-- REAL GUARD against duplicate progress reports.
--
-- A student must have at most ONE report per (term · academic year · course). There was
-- NO database constraint, and the app dedup only matched within the SAME teacher and on
-- course_id — so two different teachers (or a NULL vs set course_id) produced duplicates
-- that then showed twice in the term switcher. The 5 pre-existing duplicates were merged
-- (published kept, most-recent published kept on conflicts) before this index.
--
-- Keyed on the CONSISTENT fields (term/period/course_name, case+space-normalised) rather
-- than course_id, which was NULL on some duplicates. Partial (student_id NOT NULL): legacy
-- pre-portal reports key off student_name and are not constrained here.

CREATE UNIQUE INDEX IF NOT EXISTS uq_spr_student_term_course
  ON public.student_progress_reports (
    student_id,
    lower(btrim(coalesce(report_term, ''))),
    lower(btrim(coalesce(report_period, ''))),
    lower(btrim(coalesce(course_name, '')))
  )
  WHERE student_id IS NOT NULL;
