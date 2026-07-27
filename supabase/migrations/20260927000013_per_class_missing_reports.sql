-- ============================================================================
-- Per-Class & Per-Term Missing Report Figures + Real-Time Online Monitoring
-- ============================================================================
-- Adds explicit 'missing' count per class to accountability_coverage_mv.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.accountability_coverage_mv;

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
    WHERE COALESCE(ctr.status, 'active') NOT IN ('removed', 'ended')
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
    SELECT id FROM public.portal_users WHERE role = 'student'
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
