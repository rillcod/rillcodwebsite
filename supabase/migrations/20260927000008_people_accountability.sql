-- ============================================================================
-- Per-person accountability: one row for every account, with placement.
-- ============================================================================
-- get_academic_coverage() answers "how many?". This answers "WHO?" -- so every
-- figure on the dashboard can be clicked through to the actual people behind it.
--
-- Returns one row per portal_users account with:
--   who they are      : name, email, role, active
--   where they are    : school, class from the roster, class on their profile
--   what they hold    : report counts (published / draft)
--   what is missing   : flags for no roster, no report, draft backlog
--
-- The two class columns are deliberate. `class_from_roster` comes from
-- class_term_rosters (the academic record) and `class_on_profile` from
-- portal_users.class_id (the account record). Where they disagree, placement has
-- drifted -- surfacing that is the point.
--
-- JOIN NOTE: class_term_rosters.student_id and student_progress_reports.student_id
-- both reference PORTAL_USERS(id). parent_student_links.student_id references
-- STUDENTS(id). Mixing these silently returns nothing.
--
-- SECURITY: service_role only, same as get_academic_coverage. The API route
-- authenticates the caller and requires admin.
-- ============================================================================

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
    SELECT DISTINCT ON (ctr.student_id)
           ctr.student_id, c.name AS class_name, ctr.status
    FROM public.class_term_rosters ctr
    JOIN public.classes c ON c.id = ctr.class_id
    WHERE COALESCE(ctr.status, 'active') NOT IN ('removed', 'ended')
    ORDER BY ctr.student_id, ctr.updated_at DESC NULLS LAST, ctr.created_at DESC NULLS LAST
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
    -- students.user_id bridges the students table back to the account
    SELECT s.user_id
    FROM public.students s
    WHERE (NOT s.is_deleted OR s.is_deleted IS NULL)
      AND s.user_id IS NOT NULL
      AND (COALESCE(btrim(s.parent_phone), '') <> ''
        OR EXISTS (SELECT 1 FROM public.parent_student_links l
                   JOIN public.portal_users p ON p.id = l.parent_id
                   WHERE l.student_id = s.id AND COALESCE(btrim(p.phone), '') <> ''))
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
    (pr.user_id IS NOT NULL),
    ARRAY_REMOVE(ARRAY[
      CASE WHEN pu.role = 'student' AND ro.student_id IS NULL      THEN 'no_class'        END,
      CASE WHEN pu.role = 'student' AND COALESCE(rp.total,0) = 0   THEN 'no_report'       END,
      CASE WHEN COALESCE(rp.draft,0) > 0                           THEN 'draft_pending'   END,
      CASE WHEN pu.role = 'student' AND pr.user_id IS NULL         THEN 'no_parent_phone' END,
      CASE WHEN NOT COALESCE(pu.is_active, false)                  THEN 'inactive'        END,
      CASE WHEN pu.role = 'student' AND pu.enrollment_type IS NULL THEN 'no_enrolment_type' END,
      CASE WHEN ro.class_name IS NOT NULL AND pc.name IS NOT NULL
            AND ro.class_name <> pc.name                           THEN 'class_mismatch'  END
    ], NULL)
  FROM public.portal_users pu
  LEFT JOIN roster       ro ON ro.student_id = pu.id
  LEFT JOIN rep          rp ON rp.student_id = pu.id
  LEFT JOIN parent_reach pr ON pr.user_id    = pu.id
  LEFT JOIN public.schools sc ON sc.id = pu.school_id
  LEFT JOIN public.classes pc ON pc.id = pu.class_id
$$;

ALTER FUNCTION "public"."get_people_accountability"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_people_accountability"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_people_accountability"() TO "service_role";

COMMENT ON FUNCTION "public"."get_people_accountability"() IS
  'One row per account: who they are, where they are placed, what reports they hold, and what is missing. Backs the clickable figures on the accountability dashboard. service_role only.';

-- ============================================================================
-- VERIFY
-- ============================================================================
--   SELECT count(*) FROM public.get_people_accountability();          -- 1040
--   SELECT unnest(flags) f, count(*) FROM public.get_people_accountability()
--    GROUP BY 1 ORDER BY 2 DESC;
-- ============================================================================
