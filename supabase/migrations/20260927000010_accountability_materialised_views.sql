-- ============================================================================
-- Materialised view cache for accountability queries.
-- ============================================================================
-- The two accountability RPCs (get_people_accountability and
-- get_academic_coverage) run complex multi-table scans on every request.
-- With a large school (1000+ accounts) this can take several seconds.
--
-- This migration converts both RPCs to read from materialised views instead.
-- The views hold a pre-computed snapshot that is refreshed either:
--   a) on demand via refresh_accountability_cache() (called by the API when
--      the admin clicks Refresh), or
--   b) automatically via a pg_cron schedule (if pg_cron is enabled).
--
-- CONCURRENTLY refresh is used so readers are never blocked. This requires a
-- UNIQUE index on each materialised view.
--
-- SECURITY: the views themselves carry no RLS (they are admin-only data).
--   Access is guarded the same way as before: service_role only, via the API.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Materialised view: people accountability
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS "public"."accountability_people_mv" AS
  WITH roster AS (
    SELECT DISTINCT ON (ctr.student_id)
           ctr.student_id, c.name AS class_name, ctr.status
    FROM public.class_term_rosters ctr
    JOIN public.classes c ON c.id = ctr.class_id
    WHERE COALESCE(ctr.status, 'active') NOT IN ('removed', 'ended')
    ORDER BY ctr.student_id,
             ctr.updated_at  DESC NULLS LAST,
             ctr.created_at  DESC NULLS LAST,
             ctr.id          DESC
  ),
  rep AS (
    SELECT r.student_id,
           count(*)::int                                                             AS total,
           count(*) FILTER (WHERE r.is_published)::int                               AS published,
           count(*) FILTER (WHERE NOT r.is_published OR r.is_published IS NULL)::int AS draft
    FROM public.student_progress_reports r
    GROUP BY r.student_id
  ),
  parent_reach AS (
    SELECT s.user_id AS portal_user_id
    FROM public.students s
    WHERE (NOT s.is_deleted OR s.is_deleted IS NULL)
      AND s.user_id IS NOT NULL
      AND COALESCE(btrim(s.parent_phone), '') <> ''
    UNION
    SELECT s.user_id AS portal_user_id
    FROM public.students s
    JOIN public.parent_student_links l ON l.student_id = s.id
    JOIN public.portal_users p         ON p.id         = l.parent_id
    WHERE (NOT s.is_deleted OR s.is_deleted IS NULL)
      AND s.user_id IS NOT NULL
      AND COALESCE(btrim(p.phone), '') <> ''
  )
  SELECT
    pu.id,
    pu.full_name,
    pu.email,
    pu.role,
    COALESCE(pu.is_active, false)         AS is_active,
    pu.enrollment_type,
    COALESCE(pu.school_name, sc.name)     AS school_name,
    ro.class_name                         AS class_from_roster,
    pc.name                               AS class_on_profile,
    ro.status                             AS roster_status,
    COALESCE(rp.total, 0)                 AS reports_total,
    COALESCE(rp.published, 0)             AS reports_published,
    COALESCE(rp.draft, 0)                 AS reports_draft,
    (pr.portal_user_id IS NOT NULL)       AS has_parent_contact,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN pu.role = 'student' AND ro.student_id IS NULL
           THEN 'no_class'                                                         END,
      CASE WHEN pu.role = 'student' AND COALESCE(rp.total, 0) = 0
           THEN 'no_report'                                                        END,
      CASE WHEN COALESCE(rp.draft, 0) > 0
           THEN 'draft_pending'                                                    END,
      CASE WHEN pu.role = 'student' AND pr.portal_user_id IS NULL
           THEN 'no_parent_phone'                                                  END,
      CASE WHEN NOT COALESCE(pu.is_active, false)
           THEN 'inactive'                                                         END,
      CASE WHEN pu.role = 'student'
            AND COALESCE(pu.is_active, false)
            AND pu.enrollment_type IS NULL
           THEN 'no_enrolment_type'                                                END,
      CASE WHEN pu.role = 'student'
            AND pc.name IS NOT NULL
            AND (ro.class_name IS NULL OR ro.class_name <> pc.name)
           THEN 'class_mismatch'                                                   END
    ], NULL)                              AS flags
  FROM public.portal_users pu
  LEFT JOIN roster       ro ON ro.student_id     = pu.id
  LEFT JOIN rep          rp ON rp.student_id     = pu.id
  LEFT JOIN parent_reach pr ON pr.portal_user_id = pu.id
  LEFT JOIN public.schools sc ON sc.id = pu.school_id
  LEFT JOIN public.classes pc ON pc.id = pu.class_id
WITH DATA;

-- Unique index required for CONCURRENTLY refresh (non-blocking reads during refresh)
CREATE UNIQUE INDEX IF NOT EXISTS accountability_people_mv_id_idx
  ON "public"."accountability_people_mv" (id);

-- ---------------------------------------------------------------------------
-- 2. Materialised view: academic coverage
-- ---------------------------------------------------------------------------
-- NOTE: get_academic_coverage() returns a single jsonb blob. The materialised
-- view stores that blob in a single-row table so the existing return type is
-- preserved and the RPC body stays a trivial SELECT.
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS "public"."accountability_coverage_mv" AS
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
      'students_on_roster',   (SELECT count(DISTINCT student_id)::int FROM roster),
      'students_not_placed',  (SELECT count(*)::int FROM students s
                                WHERE NOT EXISTS (SELECT 1 FROM roster ro WHERE ro.student_id = s.id))
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
  ) AS data,
  -- Add a stable unique key so CONCURRENTLY refresh works.
  -- The view is always a single row; a fixed boolean is the simplest unique sentinel.
  true AS is_current
WITH DATA;

-- CONCURRENTLY refresh requires a unique index. A single-row view needs a fixed sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS accountability_coverage_mv_idx
  ON "public"."accountability_coverage_mv" (is_current);

-- ---------------------------------------------------------------------------
-- 3. Update get_people_accountability() to read from the materialised view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."get_people_accountability"()
RETURNS TABLE (
  id                 uuid,
  full_name          text,
  email              text,
  role               text,
  is_active          boolean,
  enrollment_type    text,
  school_name        text,
  class_from_roster  text,
  class_on_profile   text,
  roster_status      text,
  reports_total      int,
  reports_published  int,
  reports_draft      int,
  has_parent_contact boolean,
  flags              text[]
)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT
    id, full_name, email, role, is_active, enrollment_type,
    school_name, class_from_roster, class_on_profile, roster_status,
    reports_total, reports_published, reports_draft,
    has_parent_contact, flags
  FROM public.accountability_people_mv
$$;

ALTER FUNCTION "public"."get_people_accountability"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_people_accountability"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 4. Update get_academic_coverage() to read from the materialised view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."get_academic_coverage"()
RETURNS "jsonb"
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  SELECT data FROM public.accountability_coverage_mv WHERE is_current LIMIT 1
$$;

ALTER FUNCTION "public"."get_academic_coverage"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_academic_coverage"() TO "service_role";

-- ---------------------------------------------------------------------------
-- 5. New RPC: refresh_accountability_cache()
-- ---------------------------------------------------------------------------
-- Refreshes both materialised views CONCURRENTLY (non-blocking: existing
-- readers see the old snapshot until the refresh completes).
-- Called by the API route when the admin clicks Refresh.
-- service_role only; returns the timestamp of the new snapshot.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."refresh_accountability_cache"()
RETURNS timestamptz
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.accountability_people_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.accountability_coverage_mv;
  RETURN now();
END;
$$;

ALTER FUNCTION "public"."refresh_accountability_cache"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_accountability_cache"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."refresh_accountability_cache"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."refresh_accountability_cache"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."refresh_accountability_cache"() TO "service_role";

COMMENT ON FUNCTION "public"."refresh_accountability_cache"() IS
  'Refreshes both accountability materialised views CONCURRENTLY. Called by the API when an admin clicks Refresh. service_role only.';

-- ---------------------------------------------------------------------------
-- 6. Grant SELECT on materialised views to service_role
-- ---------------------------------------------------------------------------

GRANT SELECT ON "public"."accountability_people_mv"  TO "service_role";
GRANT SELECT ON "public"."accountability_coverage_mv" TO "service_role";

-- Deny all other roles direct access
REVOKE ALL ON "public"."accountability_people_mv"  FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON "public"."accountability_coverage_mv" FROM PUBLIC, "anon", "authenticated";

-- ============================================================================
-- OPTIONAL: pg_cron auto-refresh every 30 minutes (uncomment if pg_cron is
-- enabled on your Supabase project under Database > Extensions).
-- ============================================================================
-- SELECT cron.schedule(
--   'refresh-accountability-cache',
--   '*/30 * * * *',
--   $$SELECT public.refresh_accountability_cache()$$
-- );
-- ============================================================================

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT count(*) FROM public.accountability_people_mv;
--   SELECT data->>'generated_at' FROM public.accountability_coverage_mv;
--   SELECT public.refresh_accountability_cache();
-- ============================================================================
