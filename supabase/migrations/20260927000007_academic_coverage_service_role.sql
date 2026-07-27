-- ============================================================================
-- Align get_academic_coverage() with the codebase's access pattern.
-- ============================================================================
-- 20260927000006 guarded the function with an auth.uid() role check. That is the
-- wrong guard for this codebase: API routes authenticate the caller and then act
-- with the SERVICE-ROLE client, where auth.uid() is NULL. The function would have
-- refused every legitimate call from /api/admin/academic-coverage.
--
-- Access control instead comes from two layers that do apply here:
--   1. EXECUTE is granted ONLY to service_role. anon and authenticated hold no
--      privilege, so no browser client can reach it, with or without a session.
--   2. The API route resolves the caller and requires role = 'admin' before
--      invoking it.
--
-- Admin-only, deliberately: this is a cross-school census, and teachers are
-- scoped to their own schools via teacher_schools elsewhere in the system.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_academic_coverage"()
RETURNS "jsonb"
LANGUAGE "plpgsql"
STABLE
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- No in-function role check: reachable only via service_role (see header).
  WITH roster AS (
    SELECT DISTINCT ctr.class_id, ctr.student_id
    FROM public.class_term_rosters ctr
    WHERE COALESCE(ctr.status, 'active') NOT IN ('removed', 'ended')
  ),
  rep AS (
    SELECT r.student_id,
           count(*)::int                                                             AS total,
           count(*) FILTER (WHERE r.is_published)::int                               AS published,
           count(*) FILTER (WHERE NOT r.is_published OR r.is_published IS NULL)::int AS draft
    FROM public.student_progress_reports r
    GROUP BY r.student_id
  ),
  students AS (
    SELECT id FROM public.portal_users WHERE role = 'student'
  ),
  per_class AS (
    SELECT c.id,
           COALESCE(c.name, '(unnamed class)')    AS class_name,
           count(DISTINCT roster.student_id)::int AS students,
           COALESCE(sum(rep.total), 0)::int       AS reports,
           COALESCE(sum(rep.published), 0)::int   AS published,
           COALESCE(sum(rep.draft), 0)::int       AS draft
    FROM roster
    JOIN public.classes c ON c.id = roster.class_id
    LEFT JOIN rep ON rep.student_id = roster.student_id
    GROUP BY c.id, c.name
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'students',             (SELECT count(*)::int FROM students),
      'reports',              (SELECT count(*)::int FROM public.student_progress_reports),
      'published',            (SELECT count(*) FILTER (WHERE is_published)::int FROM public.student_progress_reports),
      'draft',                (SELECT count(*) FILTER (WHERE NOT is_published OR is_published IS NULL)::int
                                 FROM public.student_progress_reports),
      'students_with_report', (SELECT count(DISTINCT student_id)::int FROM public.student_progress_reports),
      'students_on_roster',   (SELECT count(DISTINCT student_id)::int FROM roster)
    ),
    'gaps', jsonb_build_object(
      'students_not_on_roster',
        (SELECT count(*)::int FROM students s
          WHERE NOT EXISTS (SELECT 1 FROM roster ro WHERE ro.student_id = s.id)),
      'students_with_no_report',
        (SELECT count(*)::int FROM students s
          WHERE NOT EXISTS (SELECT 1 FROM public.student_progress_reports r WHERE r.student_id = s.id)),
      'reports_missing_course',
        (SELECT count(*)::int FROM public.student_progress_reports WHERE course_id IS NULL),
      'reports_missing_school',
        (SELECT count(*)::int FROM public.student_progress_reports WHERE school_id IS NULL),
      'classes_with_students_but_no_report',
        (SELECT count(*)::int FROM per_class WHERE students > 0 AND reports = 0)
    ),
    'classes_without_reports', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('class', class_name, 'students', students) ORDER BY students DESC)
      FROM per_class WHERE students > 0 AND reports = 0), '[]'::jsonb),
    'by_class', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'class', class_name, 'students', students,
               'reports', reports, 'published', published, 'draft', draft)
             ORDER BY students DESC, class_name)
      FROM per_class), '[]'::jsonb),
    'drafts_by_teacher', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'drafts')::int DESC) FROM (
        SELECT jsonb_build_object(
                 'teacher', COALESCE(t.full_name, '(no teacher)'),
                 'course',  COALESCE(r.course_name, '(no course)'),
                 'term',    COALESCE(r.report_term, r.report_period, '(no term)'),
                 'drafts',  count(*)::int) AS x
        FROM public.student_progress_reports r
        LEFT JOIN public.portal_users t ON t.id = r.teacher_id
        WHERE NOT r.is_published OR r.is_published IS NULL
        GROUP BY t.full_name, r.course_name, r.report_term, r.report_period
      ) s), '[]'::jsonb),
    'possible_duplicate_classes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('normalised', k, 'names', names))
      FROM (
        SELECT lower(regexp_replace(COALESCE(c.name, ''), '\s+', ' ', 'g')) AS k,
               jsonb_agg(c.name ORDER BY c.name) AS names
        FROM public.classes c GROUP BY 1 HAVING count(*) > 1
      ) d), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_academic_coverage"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_academic_coverage"() TO "service_role";

-- ============================================================================
-- VERIFY -- anon/authenticated must both be false, service_role true
-- ============================================================================
--   SELECT has_function_privilege('anon','public.get_academic_coverage()','EXECUTE'),
--          has_function_privilege('authenticated','public.get_academic_coverage()','EXECUTE'),
--          has_function_privilege('service_role','public.get_academic_coverage()','EXECUTE');
-- ============================================================================
