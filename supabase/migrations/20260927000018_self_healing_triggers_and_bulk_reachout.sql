-- ============================================================================
-- Self-Healing Cache Triggers & Automatic Robustness Engine
-- ============================================================================
-- Creates lightweight asynchronous refresh triggers on key tables:
-- - student_progress_reports (when reports are created/published)
-- - class_term_rosters (when roster placements change)
-- - parent_student_links (when parents link to students)
-- ============================================================================

-- Helper function to trigger non-blocking cache refresh
CREATE OR REPLACE FUNCTION public.trigger_refresh_accountability()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Perform a concurrent refresh of accountability materialized views
  PERFORM public.refresh_accountability_cache();
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block the main transaction if refresh fails
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trigger_refresh_accountability() OWNER TO postgres;

-- 1. Trigger on student_progress_reports
DROP TRIGGER IF EXISTS trg_refresh_accountability_reports ON public.student_progress_reports;
CREATE TRIGGER trg_refresh_accountability_reports
  AFTER INSERT OR UPDATE OF is_published, term_id
  ON public.student_progress_reports
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trigger_refresh_accountability();

-- 2. Trigger on class_term_rosters
DROP TRIGGER IF EXISTS trg_refresh_accountability_rosters ON public.class_term_rosters;
CREATE TRIGGER trg_refresh_accountability_rosters
  AFTER INSERT OR UPDATE OF status, class_id, term_id
  ON public.class_term_rosters
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trigger_refresh_accountability();

-- 3. Trigger on parent_student_links
DROP TRIGGER IF EXISTS trg_refresh_accountability_parent_links ON public.parent_student_links;
CREATE TRIGGER trg_refresh_accountability_parent_links
  AFTER INSERT OR UPDATE OR DELETE
  ON public.parent_student_links
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trigger_refresh_accountability();
