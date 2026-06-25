-- Enforce report uniqueness at the database level: a student has at most ONE
-- progress report per (course · term · academic year · teacher). This prevents
-- the duplicate / scrambled-report situation from ever recurring, regardless of
-- which code path writes the report. NULLs are coalesced so missing course/term/
-- year still collapse to a single logical key. Scoped to rows with a real
-- student_id (pre-portal reports keyed by name are excluded).
CREATE UNIQUE INDEX IF NOT EXISTS uq_progress_report_identity
  ON student_progress_reports (
    student_id,
    COALESCE(course_id::text, ''),
    COALESCE(report_term, ''),
    COALESCE(report_period, ''),
    COALESCE(teacher_id::text, '')
  )
  WHERE student_id IS NOT NULL;
