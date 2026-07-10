-- Make canonical academic term identity authoritative for progress reports.
UPDATE public.student_progress_reports r
SET term_id = public.resolve_academic_term(r.report_period, r.report_term)
WHERE r.term_id IS NULL AND r.report_period IS NOT NULL AND r.report_term IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_progress_report_term_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.report_period IS NOT NULL AND NEW.report_term IS NOT NULL THEN
    NEW.term_id := public.resolve_academic_term(NEW.report_period, NEW.report_term);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_progress_report_term_id ON public.student_progress_reports;
CREATE TRIGGER trg_sync_progress_report_term_id
BEFORE INSERT OR UPDATE OF report_period, report_term ON public.student_progress_reports
FOR EACH ROW EXECUTE FUNCTION public.sync_progress_report_term_id();

DROP INDEX IF EXISTS public.uq_spr_student_term_course;
DROP INDEX IF EXISTS public.uq_progress_report_identity;

CREATE UNIQUE INDEX IF NOT EXISTS uq_spr_student_canonical_term_course
ON public.student_progress_reports (
  student_id,
  term_id,
  lower(btrim(coalesce(course_name, '')))
)
WHERE student_id IS NOT NULL AND term_id IS NOT NULL;

-- Historical/pre-canonical fallback. New writes receive term_id from the trigger.
CREATE UNIQUE INDEX IF NOT EXISTS uq_spr_student_legacy_term_course
ON public.student_progress_reports (
  student_id,
  lower(btrim(coalesce(report_term, ''))),
  lower(btrim(coalesce(report_period, ''))),
  lower(btrim(coalesce(course_name, '')))
)
WHERE student_id IS NOT NULL AND term_id IS NULL;