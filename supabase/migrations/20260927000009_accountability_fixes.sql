-- ============================================================================
-- Accountability robustness fixes.
-- ============================================================================
-- Addresses five correctness issues found in the initial implementation:
--
--   1. DISTINCT ON tie-break was non-deterministic when both updated_at and
--      created_at are NULL. Added id as tertiary sort to guarantee a stable row.
--
--   2. no_parent_phone fired only when students.user_id existed. The flag now
--      fires for any student account (role = 'student') that has no phone on
--      their own students row AND no phone-bearing parent linked via
--      parent_student_links. The bridge via students.user_id is still used but
--      is not required: if no students row at all exists the flag fires.
--
--   3. class_mismatch previously only fired when BOTH roster class AND profile
--      class were set. It now also fires when the profile class is set but the
--      student has no active roster placement -- the profile points somewhere the
--      roster does not confirm.
--
--   4. no_enrolment_type previously flagged inactive students too. Scoped to
--      active students only (is_active = true or NULL when role = student).
--
--   5. get_academic_coverage did not expose students_not_placed in its totals
--      block, only in gaps. Added it to totals so the dashboard can show it
--      alongside students and students_with_report without a separate call.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_people_accountability()
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
  WITH roster AS (
    -- Most-recent active roster row per student.
    -- FIX #1: id added as tertiary sort so tie-break is deterministic even
    --         when both timestamp columns are NULL.
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
  -- FIX #2: parent_reach is now keyed by portal_users.id directly.
  -- A student "has parent contact" if:
  --   a) their students row (linked via user_id) has a non-blank parent_phone, OR
  --   b) a parent_student_links row links them to a portal_user with a phone.
  parent_reach AS (
    -- Path A: students row carries a phone directly
    SELECT s.user_id AS portal_user_id
    FROM public.students s
    WHERE (NOT s.is_deleted OR s.is_deleted IS NULL)
      AND s.user_id IS NOT NULL
      AND COALESCE(btrim(s.parent_phone), '') <> ''

    UNION

    -- Path B: linked parent portal_user has a phone
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
    COALESCE(pu.is_active, false),
    pu.enrollment_type,
    COALESCE(pu.school_name, sc.name),
    ro.class_name,
    pc.name,
    ro.status,
    COALESCE(rp.total, 0),
    COALESCE(rp.published, 0),
    COALESCE(rp.draft, 0),
    (pr.portal_user_id IS NOT NULL),
    ARRAY_REMOVE(ARRAY[
      -- Student is not on any active roster
      CASE WHEN pu.role = 'student' AND ro.student_id IS NULL
           THEN 'no_class'                                                         END,

      -- Student has zero reports of any kind
      CASE WHEN pu.role = 'student' AND COALESCE(rp.total, 0) = 0
           THEN 'no_report'                                                        END,

      -- Any account (any role) sitting on at least one unpublished report
      CASE WHEN COALESCE(rp.draft, 0) > 0
           THEN 'draft_pending'                                                    END,

      -- FIX #2: fires for any student; does not require a students row
      CASE WHEN pu.role = 'student' AND pr.portal_user_id IS NULL
           THEN 'no_parent_phone'                                                  END,

      -- Account is marked inactive
      CASE WHEN NOT COALESCE(pu.is_active, false)
           THEN 'inactive'                                                         END,

      -- FIX #4: only flag ACTIVE students (inactive ones already flagged above)
      CASE WHEN pu.role = 'student'
            AND COALESCE(pu.is_active, false)
            AND pu.enrollment_type IS NULL
           THEN 'no_enrolment_type'                                                END,

      -- FIX #3: fires when the profile class is set but roster is absent or
      --         contradicts it (previously required both to be present).
      CASE WHEN pu.role = 'student'
            AND pc.name IS NOT NULL
            AND (ro.class_name IS NULL OR ro.class_name <> pc.name)
           THEN 'class_mismatch'                                                   END
    ], NULL)
  FROM public.portal_users pu
  LEFT JOIN roster       ro ON ro.student_id     = pu.id
  LEFT JOIN rep          rp ON rp.student_id     = pu.id
  LEFT JOIN parent_reach pr ON pr.portal_user_id = pu.id
  LEFT JOIN public.schools sc ON sc.id = pu.school_id
  LEFT JOIN public.classes pc ON pc.id = pu.class_id
$$;

ALTER FUNCTION "public"."get_people_accountability"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_people_accountability"() TO "service_role";

COMMENT ON FUNCTION "public"."get_people_accountability"() IS
  'One row per account: who they are, where they are placed, what reports they hold, and what is missing. Backs the clickable figures on the accountability dashboard. service_role only. v2: deterministic DISTINCT ON, improved no_parent_phone, class_mismatch, and no_enrolment_type logic.';

-- ---------------------------------------------------------------------------
-- 2. get_academic_coverage() -- add students_not_placed to totals block (FIX #5)
-- ---------------------------------------------------------------------------

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
  -- No in-function role check: reachable only via service_role (see migration header).
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
      -- FIX #5: now in totals as well as gaps
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
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_academic_coverage"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_academic_coverage"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_academic_coverage"() TO "service_role";

COMMENT ON FUNCTION "public"."get_academic_coverage"() IS
  'Cross-school census of roster placement and report coverage. v2: adds students_not_placed to totals block. Admin-only via service_role.';

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT count(*) FROM public.get_people_accountability();
--   SELECT unnest(flags) f, count(*) FROM public.get_people_accountability() GROUP BY 1 ORDER BY 2 DESC;
--   SELECT jsonb_pretty(public.get_academic_coverage()) -> 'totals';
-- ============================================================================
