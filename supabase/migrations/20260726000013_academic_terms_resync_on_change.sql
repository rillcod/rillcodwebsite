-- Correctness hardening: the autosync triggers only set term_id when it was NULL, so
-- EDITING the source fields (e.g. changing a report's term from First → Second, or an
-- assignment's due_date into a different term) left term_id stale — the FK and the
-- human-facing text/date would silently diverge. These replacements re-derive term_id
-- whenever the source field actually changes, while still allowing a future explicit
-- term_id to stick when the source is unchanged. Never wipes a good value to NULL.

-- ── label/period entities ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_report_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.report_period IS DISTINCT FROM OLD.report_period
     OR NEW.report_term   IS DISTINCT FROM OLD.report_term THEN
    IF NEW.report_period IS NOT NULL AND NEW.report_term IS NOT NULL THEN
      v_candidate := public.resolve_academic_term(NEW.report_period, NEW.report_term);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_lesson_plan_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.term IS DISTINCT FROM OLD.term THEN
    IF NEW.term IS NOT NULL AND NEW.term ~ '\d{4}/\d{4}' THEN
      v_candidate := public.resolve_academic_term(substring(NEW.term FROM '(\d{4}/\d{4})'), NEW.term);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_timetable_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.academic_year IS DISTINCT FROM OLD.academic_year
     OR NEW.term          IS DISTINCT FROM OLD.term THEN
    IF NEW.academic_year IS NOT NULL AND NEW.term IS NOT NULL THEN
      v_candidate := public.resolve_academic_term(NEW.academic_year, NEW.term);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- ── date-bucketed entities ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_assignment_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    IF NEW.due_date IS NOT NULL THEN
      v_candidate := public.term_id_for_date(NEW.due_date::date);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_class_term_id() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_candidate uuid;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    IF NEW.start_date IS NOT NULL THEN
      v_candidate := public.term_id_for_date(NEW.start_date::date);
      IF v_candidate IS NOT NULL THEN NEW.term_id := v_candidate; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
