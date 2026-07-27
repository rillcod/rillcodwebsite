-- ============================================================================
-- Cross-term report backlog.
-- ============================================================================
-- get_academic_coverage() is scoped to the current academic term:
--     WHERE ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id
-- Sensible as a default, but it means the dashboard currently shows 559 of 921
-- reports and 37 of 86 unpublished drafts. The 49 hidden drafts are the OLDEST
-- ones -- First and Second Term work that was never published. A term filter
-- that conceals overdue work defeats the purpose of an accountability view.
--
-- This is deliberately a SEPARATE function rather than a change to
-- get_academic_coverage, so the existing term-scoped behaviour and anything
-- built on it stay exactly as they are. Additive only.
--
-- JOIN NOTE: student_progress_reports.student_id references PORTAL_USERS(id),
-- not students(id).
--
-- SECURITY: service_role only; the API route authenticates and requires admin.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_report_backlog"()
RETURNS "jsonb"
LANGUAGE "plpgsql"
STABLE
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_term_id uuid;
  v_result  jsonb;
BEGIN
  SELECT id INTO v_term_id
    FROM public.academic_terms
   WHERE is_current
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  WITH rep AS (
    SELECT r.*,
           (v_term_id IS NULL OR r.term_id IS NULL OR r.term_id = v_term_id) AS in_term,
           (NOT r.is_published OR r.is_published IS NULL)                    AS is_draft
    FROM public.student_progress_reports r
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'current_term_id', v_term_id,

    -- Both scopes side by side, so the term view can never hide debt.
    'all_terms', jsonb_build_object(
      'reports',   (SELECT count(*)::int FROM rep),
      'published', (SELECT count(*) FILTER (WHERE NOT is_draft)::int FROM rep),
      'drafts',    (SELECT count(*) FILTER (WHERE is_draft)::int FROM rep)),
    'current_term', jsonb_build_object(
      'reports',   (SELECT count(*) FILTER (WHERE in_term)::int FROM rep),
      'published', (SELECT count(*) FILTER (WHERE in_term AND NOT is_draft)::int FROM rep),
      'drafts',    (SELECT count(*) FILTER (WHERE in_term AND is_draft)::int FROM rep)),
    'hidden_by_term_filter', jsonb_build_object(
      'reports',   (SELECT count(*) FILTER (WHERE NOT in_term)::int FROM rep),
      'drafts',    (SELECT count(*) FILTER (WHERE NOT in_term AND is_draft)::int FROM rep)),

    -- Unpublished work from a term that has already ended, oldest first.
    -- This is the list to chase.
    'overdue_by_teacher', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'teacher',     teacher,
               'course',      course,
               'term',        term,
               'drafts',      drafts,
               'oldest_days', oldest_days)
             ORDER BY oldest_days DESC NULLS LAST, drafts DESC)
      FROM (
        SELECT COALESCE(t.full_name, '(no teacher)')                     AS teacher,
               COALESCE(rep.course_name, '(no course)')                  AS course,
               COALESCE(rep.report_term, rep.report_period, '(no term)') AS term,
               count(*)::int                                             AS drafts,
               max(EXTRACT(DAY FROM now() - COALESCE(rep.created_at, rep.report_date::timestamptz)))::int AS oldest_days
        FROM rep
        LEFT JOIN public.portal_users t ON t.id = rep.teacher_id
        WHERE rep.is_draft AND NOT rep.in_term
        GROUP BY 1, 2, 3
      ) x), '[]'::jsonb),

    -- Every unpublished report regardless of term, grouped by term label, so
    -- the size of each term's debt is visible at a glance.
    'drafts_by_term', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('term', term, 'drafts', drafts, 'is_current_term', in_term)
                       ORDER BY drafts DESC)
      FROM (
        SELECT COALESCE(report_term, report_period, '(no term)') AS term,
               bool_or(in_term)                                   AS in_term,
               count(*)::int                                      AS drafts
        FROM rep WHERE is_draft GROUP BY 1
      ) y), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_report_backlog"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_report_backlog"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_report_backlog"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_report_backlog"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_report_backlog"() TO "service_role";

COMMENT ON FUNCTION "public"."get_report_backlog"() IS
  'Unpublished reports across ALL terms, not just the current one. get_academic_coverage is term-scoped and hides older drafts; this exposes that backlog so it can be chased. service_role only.';

-- ============================================================================
-- VERIFY -- hidden_by_term_filter.drafts should be > 0 while old drafts exist
-- ============================================================================
--   SELECT jsonb_pretty(public.get_report_backlog());
-- ============================================================================
