-- Make the canonical term_id self-maintaining: BEFORE INSERT/UPDATE triggers derive
-- term_id from the existing text/date fields each entity already writes, so the new
-- structure stays in sync with ZERO app changes and nothing can drift out of date.

-- resolve_academic_term must be able to create a term for a future year even when the
-- writer is a low-privilege user (RLS allows only SELECT on academic_terms), so make it
-- SECURITY DEFINER. It only manages reference data.
CREATE OR REPLACE FUNCTION public.resolve_academic_term(p_year text, p_term text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_num int;
  v_label text;
  v_id uuid;
BEGIN
  IF p_year IS NULL OR btrim(p_year) = '' THEN RETURN NULL; END IF;
  v_num := CASE
    WHEN p_term ILIKE '%first%'  OR p_term = '1' THEN 1
    WHEN p_term ILIKE '%second%' OR p_term = '2' THEN 2
    WHEN p_term ILIKE '%third%'  OR p_term = '3' THEN 3
    ELSE NULL END;
  IF v_num IS NULL THEN RETURN NULL; END IF;
  v_label := (ARRAY['First Term', 'Second Term', 'Third Term'])[v_num];
  SELECT id INTO v_id FROM public.academic_terms WHERE academic_year = p_year AND term_number = v_num;
  IF v_id IS NULL THEN
    INSERT INTO public.academic_terms (academic_year, term_number, term_label)
    VALUES (p_year, v_num, v_label)
    ON CONFLICT (academic_year, term_number) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Term whose date range contains a given date (for date-bucketed entities).
CREATE OR REPLACE FUNCTION public.term_id_for_date(p_date date)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.academic_terms
  WHERE p_date BETWEEN start_date AND end_date
  ORDER BY start_date DESC LIMIT 1;
$$;

-- ── label/period entities ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_report_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.term_id IS NULL AND NEW.report_period IS NOT NULL AND NEW.report_term IS NOT NULL THEN
    NEW.term_id := public.resolve_academic_term(NEW.report_period, NEW.report_term);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_report_term_id ON public.student_progress_reports;
CREATE TRIGGER trg_sync_report_term_id BEFORE INSERT OR UPDATE ON public.student_progress_reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_report_term_id();

CREATE OR REPLACE FUNCTION public.sync_lesson_plan_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.term_id IS NULL AND NEW.term IS NOT NULL AND NEW.term ~ '\d{4}/\d{4}' THEN
    NEW.term_id := public.resolve_academic_term(substring(NEW.term FROM '(\d{4}/\d{4})'), NEW.term);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_lesson_plan_term_id ON public.lesson_plans;
CREATE TRIGGER trg_sync_lesson_plan_term_id BEFORE INSERT OR UPDATE ON public.lesson_plans
  FOR EACH ROW EXECUTE FUNCTION public.sync_lesson_plan_term_id();

CREATE OR REPLACE FUNCTION public.sync_timetable_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.term_id IS NULL AND NEW.academic_year IS NOT NULL AND NEW.term IS NOT NULL THEN
    NEW.term_id := public.resolve_academic_term(NEW.academic_year, NEW.term);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_timetable_term_id ON public.timetables;
CREATE TRIGGER trg_sync_timetable_term_id BEFORE INSERT OR UPDATE ON public.timetables
  FOR EACH ROW EXECUTE FUNCTION public.sync_timetable_term_id();

-- ── date-bucketed entities ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_assignment_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.term_id IS NULL AND NEW.due_date IS NOT NULL THEN
    NEW.term_id := public.term_id_for_date(NEW.due_date::date);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_assignment_term_id ON public.assignments;
CREATE TRIGGER trg_sync_assignment_term_id BEFORE INSERT OR UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_assignment_term_id();

CREATE OR REPLACE FUNCTION public.sync_class_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.term_id IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.term_id := public.term_id_for_date(NEW.start_date::date);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_class_term_id ON public.classes;
CREATE TRIGGER trg_sync_class_term_id BEFORE INSERT OR UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.sync_class_term_id();
