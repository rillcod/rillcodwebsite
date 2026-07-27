-- ============================================================================
-- Refine Class Mismatch & Withdrawn Filter Logic
-- ============================================================================
-- Fixes false positive class_mismatch and no_class flags:
-- 1. Excludes withdrawn/ended/inactive students from class_mismatch, no_class,
--    and no_report audits (withdrawn students are naturally not placed).
-- 2. Uses case-insensitive, whitespace-normalized string comparison for class names
--    so "PRIMARY 1" and "Primary 1 " are recognized as aligned.
-- 3. Ensures class_mismatch only fires when both profile class and roster class
--    exist and genuinely contradict each other.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.accountability_coverage_mv;
DROP MATERIALIZED VIEW IF EXISTS public.accountability_people_mv;

-- ---------------------------------------------------------------------------
-- 1. People Materialised View
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW public.accountability_people_mv AS
  WITH current_term AS (
    SELECT id, academic_year, term_label
    FROM public.academic_terms
    WHERE is_current = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ),
  roster AS (
    SELECT DISTINCT ON (ctr.student_id)
           ctr.student_id,
           c.name  AS class_name,
           ctr.status
    FROM public.class_term_rosters ctr
    JOIN public.classes c ON c.id = ctr.class_id
    LEFT JOIN current_term ct ON true
    WHERE (ct.id IS NULL OR ctr.term_id IS NULL OR ctr.term_id = ct.id)
    ORDER BY ctr.student_id,
             ctr.updated_at DESC NULLS LAST,
             ctr.created_at DESC NULLS LAST,
             ctr.id         DESC
  ),
  rep AS (
    SELECT r.student_id,
           count(*)::int                                                             AS total,
           count(*) FILTER (WHERE r.is_published)::int                               AS published,
           count(*) FILTER (WHERE NOT r.is_published OR r.is_published IS NULL)::int AS draft
    FROM public.student_progress_reports r
    LEFT JOIN current_term ct ON true
    WHERE (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)
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
    COALESCE(pu.is_active, false)      AS is_active,
    pu.enrollment_type,
    COALESCE(pu.school_name, sc.name)  AS school_name,
    ro.class_name                      AS class_from_roster,
    pc.name                            AS class_on_profile,
    ro.status                          AS roster_status,
    COALESCE(rp.total,     0)          AS reports_total,
    COALESCE(rp.published, 0)          AS reports_published,
    COALESCE(rp.draft,     0)          AS reports_draft,
    (pr.portal_user_id IS NOT NULL)    AS has_parent_contact,
    ARRAY_REMOVE(ARRAY[
      -- Withdrawn / Ended account
      CASE WHEN pu.role = 'student'
            AND (ro.status IN ('withdrawn', 'ended', 'removed')
                 OR lower(COALESCE(pu.enrollment_type, '')) = 'withdrawn'
                 OR NOT COALESCE(pu.is_active, false))
           THEN 'withdrawn'          END,
      -- Account inactive
      CASE WHEN NOT COALESCE(pu.is_active, false)
           THEN 'inactive'           END,
      -- Active student not on any term roster
      CASE WHEN pu.role = 'student'
            AND COALESCE(pu.is_active, false)
            AND COALESCE(ro.status, 'active') NOT IN ('withdrawn', 'ended', 'removed')
            AND lower(COALESCE(pu.enrollment_type, '')) <> 'withdrawn'
            AND ro.student_id IS NULL
           THEN 'no_class'           END,
      -- Active student with no report for the current term
      CASE WHEN pu.role = 'student'
            AND COALESCE(pu.is_active, false)
            AND COALESCE(ro.status, 'active') NOT IN ('withdrawn', 'ended', 'removed')
            AND lower(COALESCE(pu.enrollment_type, '')) <> 'withdrawn'
            AND COALESCE(rp.total, 0) = 0
           THEN 'no_report'          END,
      -- Holding an unpublished draft report for current term
      CASE WHEN COALESCE(rp.draft, 0) > 0
           THEN 'draft_pending'      END,
      -- Active student with no parent phone reachable
      CASE WHEN pu.role = 'student'
            AND COALESCE(pu.is_active, false)
            AND COALESCE(ro.status, 'active') NOT IN ('withdrawn', 'ended', 'removed')
            AND lower(COALESCE(pu.enrollment_type, '')) <> 'withdrawn'
            AND pr.portal_user_id IS NULL
           THEN 'no_parent_phone'    END,
      -- Active student with no enrolment type
      CASE WHEN pu.role = 'student'
            AND COALESCE(pu.is_active, false)
            AND COALESCE(ro.status, 'active') NOT IN ('withdrawn', 'ended', 'removed')
            AND lower(COALESCE(pu.enrollment_type, '')) <> 'withdrawn'
            AND pu.enrollment_type IS NULL
           THEN 'no_enrolment_type'  END,
      -- Profile class disagrees with official term roster (Active students only, normalized comparison)
      CASE WHEN pu.role = 'student'
            AND COALESCE(pu.is_active, false)
            AND COALESCE(ro.status, 'active') NOT IN ('withdrawn', 'ended', 'removed')
            AND lower(COALESCE(pu.enrollment_type, '')) <> 'withdrawn'
            AND pc.name IS NOT NULL
            AND ro.class_name IS NOT NULL
            AND lower(regexp_replace(btrim(pc.name), '\s+', ' ', 'g')) <> lower(regexp_replace(btrim(ro.class_name), '\s+', ' ', 'g'))
           THEN 'class_mismatch'     END
    ], NULL) AS flags
  FROM public.portal_users pu
  LEFT JOIN roster        ro ON ro.student_id     = pu.id
  LEFT JOIN rep           rp ON rp.student_id     = pu.id
  LEFT JOIN parent_reach  pr ON pr.portal_user_id = pu.id
  LEFT JOIN public.schools   sc ON sc.id = pu.school_id
  LEFT JOIN public.classes   pc ON pc.id = pu.class_id
WITH DATA;

CREATE UNIQUE INDEX accountability_people_mv_pk ON public.accountability_people_mv (id);

-- ---------------------------------------------------------------------------
-- 2. Coverage Materialised View
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW public.accountability_coverage_mv AS
  WITH current_term AS (
    SELECT id, academic_year, term_label
    FROM public.academic_terms
    WHERE is_current = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ),
  roster AS (
    SELECT DISTINCT ctr.class_id, ctr.student_id
    FROM public.class_term_rosters ctr
    LEFT JOIN current_term ct ON true
    WHERE COALESCE(ctr.status, 'active') NOT IN ('removed', 'ended', 'withdrawn')
      AND (ct.id IS NULL OR ctr.term_id IS NULL OR ctr.term_id = ct.id)
  ),
  rep AS (
    SELECT r.student_id,
           count(*)::int                                                             AS total,
           count(*) FILTER (WHERE r.is_published)::int                               AS published,
           count(*) FILTER (WHERE NOT r.is_published OR r.is_published IS NULL)::int AS draft
    FROM public.student_progress_reports r
    LEFT JOIN current_term ct ON true
    WHERE (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)
    GROUP BY r.student_id
  ),
  students AS (
    SELECT id FROM public.portal_users
    WHERE role = 'student'
      AND COALESCE(is_active, false)
      AND lower(COALESCE(enrollment_type, '')) <> 'withdrawn'
  ),
  per_class AS (
    SELECT c.id,
           COALESCE(c.name, '(unnamed class)')    AS class_name,
           count(DISTINCT roster.student_id)::int AS students,
           COALESCE(sum(rep.total),     0)::int   AS reports,
           COALESCE(sum(rep.published), 0)::int   AS published,
           COALESCE(sum(rep.draft),     0)::int   AS draft,
           (count(DISTINCT roster.student_id)::int - count(DISTINCT roster.student_id) FILTER (WHERE rep.student_id IS NOT NULL)::int) AS missing
    FROM roster
    JOIN public.classes c ON c.id = roster.class_id
    LEFT JOIN rep ON rep.student_id = roster.student_id
    GROUP BY c.id, c.name
  )
  SELECT
    jsonb_build_object(
      'generated_at', now(),
      'term_context', (
        SELECT jsonb_build_object(
          'term_id', id,
          'academic_year', academic_year,
          'term_label', term_label
        ) FROM current_term
      ),
      'totals', jsonb_build_object(
        'students',             (SELECT count(*)::int FROM students),
        'withdrawn_students',   (SELECT count(*)::int FROM public.accountability_people_mv WHERE 'withdrawn' = ANY(flags)),
        'reports',              (SELECT count(*)::int FROM public.student_progress_reports r
                                 LEFT JOIN current_term ct ON true
                                 WHERE (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)),
        'published',            (SELECT count(*) FILTER (WHERE is_published)::int
                                 FROM public.student_progress_reports r
                                 LEFT JOIN current_term ct ON true
                                 WHERE (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)),
        'draft',                (SELECT count(*) FILTER (WHERE NOT is_published OR is_published IS NULL)::int
                                 FROM public.student_progress_reports r
                                 LEFT JOIN current_term ct ON true
                                 WHERE (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)),
        'students_with_report', (SELECT count(DISTINCT student_id)::int
                                 FROM public.student_progress_reports r
                                 LEFT JOIN current_term ct ON true
                                 WHERE (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)),
        'students_on_roster',   (SELECT count(DISTINCT student_id)::int FROM roster),
        'students_not_placed',  (SELECT count(*)::int FROM students s
                                   WHERE NOT EXISTS (
                                     SELECT 1 FROM roster ro WHERE ro.student_id = s.id))
      ),
      'gaps', jsonb_build_object(
        'students_not_on_roster',
          (SELECT count(*)::int FROM students s
            WHERE NOT EXISTS (SELECT 1 FROM roster ro WHERE ro.student_id = s.id)),
        'students_with_no_report',
          (SELECT count(*)::int FROM students s
            WHERE NOT EXISTS (
              SELECT 1 FROM public.student_progress_reports r
              LEFT JOIN current_term ct ON true
              WHERE r.student_id = s.id
                AND (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id))),
        'reports_missing_course',
          (SELECT count(*)::int FROM public.student_progress_reports r
           LEFT JOIN current_term ct ON true
           WHERE r.course_id IS NULL
             AND (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)),
        'reports_missing_school',
          (SELECT count(*)::int FROM public.student_progress_reports r
           LEFT JOIN current_term ct ON true
           WHERE r.school_id IS NULL
             AND (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)),
        'classes_with_students_but_no_report',
          (SELECT count(*)::int FROM per_class WHERE students > 0 AND reports = 0)
      ),
      'classes_without_reports', COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object('class', class_name, 'students', students)
                 ORDER BY students DESC)
        FROM per_class WHERE students > 0 AND reports = 0), '[]'::jsonb),
      'by_class', COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'class', class_name, 'students', students,
                   'reports', reports, 'published', published, 'draft', draft,
                   'missing', missing)
                 ORDER BY students DESC, class_name)
        FROM per_class), '[]'::jsonb),
      'by_teacher', COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'teacher_id', teacher_id,
                   'teacher', teacher_name,
                   'course', course_name,
                   'term', term_name,
                   'total_reports', total_reports,
                   'published', published_reports,
                   'drafts', draft_reports,
                   'completion_pct', CASE WHEN total_reports > 0 THEN round((published_reports::numeric / total_reports::numeric) * 100) ELSE 0 END
                 )
                 ORDER BY draft_reports DESC, total_reports DESC
               )
        FROM (
          SELECT
            r.teacher_id,
            COALESCE(t.full_name, '(no teacher)') AS teacher_name,
            COALESCE(r.course_name, '(no course)') AS course_name,
            COALESCE(r.report_term, r.report_period, '(no term)') AS term_name,
            count(*)::int AS total_reports,
            count(*) FILTER (WHERE r.is_published)::int AS published_reports,
            count(*) FILTER (WHERE NOT r.is_published OR r.is_published IS NULL)::int AS draft_reports
          FROM public.student_progress_reports r
          LEFT JOIN public.portal_users t ON t.id = r.teacher_id
          LEFT JOIN current_term ct ON true
          WHERE (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)
          GROUP BY r.teacher_id, t.full_name, r.course_name, r.report_term, r.report_period
        ) s), '[]'::jsonb),
      'drafts_by_teacher', COALESCE((
        SELECT jsonb_agg(x ORDER BY (x->>'drafts')::int DESC) FROM (
          SELECT jsonb_build_object(
                   'teacher', COALESCE(t.full_name, '(no teacher)'),
                   'course',  COALESCE(r.course_name, '(no course)'),
                   'term',    COALESCE(r.report_term, r.report_period, '(no term)'),
                   'drafts',  count(*)::int) AS x
          FROM public.student_progress_reports r
          LEFT JOIN public.portal_users t ON t.id = r.teacher_id
          LEFT JOIN current_term ct ON true
          WHERE (NOT r.is_published OR r.is_published IS NULL)
            AND (ct.id IS NULL OR r.term_id IS NULL OR r.term_id = ct.id)
          GROUP BY t.full_name, r.course_name, r.report_term, r.report_period
        ) s), '[]'::jsonb),
      'possible_duplicate_classes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('normalised', k, 'names', names))
        FROM (
          SELECT lower(regexp_replace(COALESCE(c.name, ''), '\s+', ' ', 'g')) AS k,
                 jsonb_agg(c.name ORDER BY c.name) AS names
          FROM public.classes c
          GROUP BY 1 HAVING count(*) > 1
        ) d), '[]'::jsonb)
    ) AS data,
    true AS is_current
WITH DATA;

CREATE UNIQUE INDEX accountability_coverage_mv_pk ON public.accountability_coverage_mv (is_current);

-- ---------------------------------------------------------------------------
-- 3. Update RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_people_accountability()
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, full_name, email, role, is_active, enrollment_type,
         school_name, class_from_roster, class_on_profile, roster_status,
         reports_total, reports_published, reports_draft,
         has_parent_contact, flags
  FROM public.accountability_people_mv;
$$;

CREATE OR REPLACE FUNCTION public.get_academic_coverage()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT data
  FROM public.accountability_coverage_mv
  WHERE is_current
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.refresh_accountability_cache()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.accountability_people_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.accountability_coverage_mv;
  RETURN now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_people_accountability() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_academic_coverage() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_accountability_cache() TO service_role;

GRANT SELECT ON public.accountability_people_mv TO service_role;
GRANT SELECT ON public.accountability_coverage_mv TO service_role;
