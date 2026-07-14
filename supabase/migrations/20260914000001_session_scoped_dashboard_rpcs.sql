-- Session-scoped dashboard RPCs + enrollment term grades
-- HARD RULE: averages / pending / graded counts use year + term (academic_terms.id).
-- Legacy null assignment/CBT term_id rows still count toward the live session only.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Live term resolver (calendar-first, matches app liveAcademicSession())
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.live_academic_term_id(p_now date DEFAULT CURRENT_DATE)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id uuid;
  v_year text;
  v_label text;
  v_month int := EXTRACT(MONTH FROM p_now)::int;
  v_y int := EXTRACT(YEAR FROM p_now)::int;
BEGIN
  -- Prefer explicit date window on academic_terms
  SELECT id INTO v_id
  FROM public.academic_terms
  WHERE start_date IS NOT NULL
    AND end_date IS NOT NULL
    AND p_now BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Nigerian Sept–Aug calendar fallback (same as TypeScript)
  IF v_month >= 9 THEN
    v_year := v_y::text || '/' || (v_y + 1)::text;
    v_label := 'First Term';
  ELSIF v_month >= 5 THEN
    v_year := (v_y - 1)::text || '/' || v_y::text;
    v_label := 'Third Term';
  ELSE
    v_year := (v_y - 1)::text || '/' || v_y::text;
    v_label := 'Second Term';
  END IF;

  SELECT id INTO v_id
  FROM public.academic_terms
  WHERE academic_year = v_year
    AND term_label = v_label
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Last resort: is_current flag
  RETURN public.current_academic_term();
END;
$$;

COMMENT ON FUNCTION public.live_academic_term_id(date) IS
  'Canonical live academic session (year + term). Date window → calendar → is_current.';

-- Keep current_academic_term() aligned with the live resolver.
CREATE OR REPLACE FUNCTION public.current_academic_term()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT public.live_academic_term_id(CURRENT_DATE);
$$;

-- Assignment belongs to term when exact match, or untagged legacy (NULL) for that session.
CREATE OR REPLACE FUNCTION public.assignment_matches_term(
  p_assignment_term_id uuid,
  p_term_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_term_id IS NULL
      OR p_assignment_term_id IS NOT DISTINCT FROM p_term_id
      OR p_assignment_term_id IS NULL;
$$;

-- CBT belongs to term via metadata.term_id / academic_term_id, else end_time in term window.
CREATE OR REPLACE FUNCTION public.cbt_session_matches_term(
  p_end_time timestamptz,
  p_metadata jsonb,
  p_term_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_meta_term text;
  v_start date;
  v_end date;
BEGIN
  IF p_term_id IS NULL THEN
    RETURN true;
  END IF;

  v_meta_term := NULLIF(btrim(COALESCE(
    p_metadata ->> 'term_id',
    p_metadata ->> 'academic_term_id',
    ''
  )), '');
  IF v_meta_term IS NOT NULL THEN
    RETURN v_meta_term = p_term_id::text;
  END IF;

  SELECT start_date, end_date INTO v_start, v_end
  FROM public.academic_terms
  WHERE id = p_term_id;

  IF v_start IS NULL AND v_end IS NULL THEN
    -- No bounds: keep untagged CBT in live session (legacy)
    RETURN true;
  END IF;

  IF p_end_time IS NULL THEN
    RETURN true;
  END IF;

  IF v_start IS NOT NULL AND p_end_time::date < v_start THEN
    RETURN false;
  END IF;
  IF v_end IS NOT NULL AND p_end_time::date > v_end THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_academic_term_id(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assignment_matches_term(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_session_matches_term(timestamptz, jsonb, uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Enrollment grades keyed by academic session
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.enrollment_term_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.academic_terms(id),
  grade text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_term_grades_enrollment
  ON public.enrollment_term_grades(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_term_grades_term
  ON public.enrollment_term_grades(term_id);

ALTER TABLE public.enrollment_term_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enrollment_term_grades_select ON public.enrollment_term_grades;
CREATE POLICY enrollment_term_grades_select ON public.enrollment_term_grades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND (
          e.user_id = auth.uid()
          OR public.is_staff()
        )
    )
  );

DROP POLICY IF EXISTS enrollment_term_grades_write_staff ON public.enrollment_term_grades;
CREATE POLICY enrollment_term_grades_write_staff ON public.enrollment_term_grades
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Backfill: existing enrollment.grade → live session row
INSERT INTO public.enrollment_term_grades (enrollment_id, term_id, grade, notes)
SELECT e.id, public.live_academic_term_id(), e.grade, e.notes
FROM public.enrollments e
WHERE e.grade IS NOT NULL
  AND public.live_academic_term_id() IS NOT NULL
ON CONFLICT (enrollment_id, term_id) DO NOTHING;

-- Keep enrollments.grade as denormalized "live session" mirror
CREATE OR REPLACE FUNCTION public.sync_enrollment_live_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live uuid := public.live_academic_term_id();
BEGIN
  IF v_live IS NOT NULL AND NEW.term_id = v_live THEN
    UPDATE public.enrollments
    SET grade = NEW.grade,
        notes = COALESCE(NEW.notes, notes),
        updated_at = now()
    WHERE id = NEW.enrollment_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_enrollment_live_grade ON public.enrollment_term_grades;
CREATE TRIGGER trg_sync_enrollment_live_grade
AFTER INSERT OR UPDATE OF grade, notes, term_id
ON public.enrollment_term_grades
FOR EACH ROW
EXECUTE FUNCTION public.sync_enrollment_live_grade();

CREATE OR REPLACE FUNCTION public.upsert_enrollment_term_grade(
  p_enrollment_id uuid,
  p_grade text,
  p_notes text DEFAULT NULL,
  p_term_id uuid DEFAULT NULL
)
RETURNS public.enrollment_term_grades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term uuid := COALESCE(p_term_id, public.live_academic_term_id());
  v_row public.enrollment_term_grades;
BEGIN
  IF v_term IS NULL THEN
    RAISE EXCEPTION 'No academic term available for enrollment grade';
  END IF;

  INSERT INTO public.enrollment_term_grades (enrollment_id, term_id, grade, notes, updated_at)
  VALUES (p_enrollment_id, v_term, p_grade, p_notes, now())
  ON CONFLICT (enrollment_id, term_id) DO UPDATE
    SET grade = EXCLUDED.grade,
        notes = COALESCE(EXCLUDED.notes, public.enrollment_term_grades.notes),
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_enrollment_term_grade(uuid, text, text, uuid)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Teacher / student / school / admin dashboard RPCs
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_teacher_dashboard_stats(uuid);
CREATE OR REPLACE FUNCTION public.get_teacher_dashboard_stats(
  teacher_uuid uuid,
  term_uuid uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  school_ids uuid[];
  school_names text[];
  assignment_ids uuid[];
  exam_ids uuid[];
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
BEGIN
  SELECT ARRAY_AGG(DISTINCT school_id) INTO school_ids
  FROM (
    SELECT school_id FROM portal_users WHERE id = teacher_uuid
    UNION
    SELECT school_id FROM teacher_schools WHERE teacher_id = teacher_uuid
    UNION
    SELECT school_id FROM classes WHERE teacher_id = teacher_uuid
  ) schools
  WHERE school_id IS NOT NULL;

  SELECT ARRAY_AGG(DISTINCT name) INTO school_names
  FROM schools WHERE id = ANY(school_ids);

  SELECT ARRAY_AGG(id) INTO assignment_ids
  FROM assignments
  WHERE created_by = teacher_uuid
    AND public.assignment_matches_term(term_id, v_term);

  SELECT ARRAY_AGG(e.id) INTO exam_ids
  FROM cbt_exams e
  WHERE e.created_by = teacher_uuid
    AND (
      v_term IS NULL
      OR NULLIF(btrim(COALESCE(e.metadata ->> 'term_id', e.metadata ->> 'academic_term_id', '')), '') = v_term::text
      OR NULLIF(btrim(COALESCE(e.metadata ->> 'term_id', e.metadata ->> 'academic_term_id', '')), '') IS NULL
    );

  SELECT json_build_object(
    'term_id', v_term,
    'classes', (
      SELECT COUNT(*) FROM classes
      WHERE (teacher_id = teacher_uuid
         OR (school_ids IS NOT NULL AND school_id = ANY(school_ids)))
        AND public.assignment_matches_term(term_id, v_term)
    ),
    'portal_students', (
      SELECT COUNT(*) FROM portal_users
      WHERE role = 'student'
        AND (school_ids IS NOT NULL AND school_id = ANY(school_ids))
    ),
    'registry_students', (
      SELECT COUNT(*) FROM students
      WHERE user_id IS NULL
        AND (
          (school_ids IS NOT NULL AND school_id = ANY(school_ids))
          OR (school_names IS NOT NULL AND school_name = ANY(school_names))
        )
    ),
    'pending_assignments', (
      SELECT COUNT(*) FROM assignment_submissions
      WHERE assignment_id = ANY(assignment_ids)
        AND status = 'submitted'
        AND grade IS NULL
    ),
    'pending_exams', (
      SELECT COUNT(*) FROM cbt_sessions
      WHERE exam_id = ANY(exam_ids)
        AND needs_grading = true
    ),
    'avg_grade', (
      SELECT COALESCE(AVG((s.grade::float / NULLIF(a.max_points, 0)) * 100), 0)::integer
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.assignment_id = ANY(assignment_ids)
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    )
  ) INTO result;

  RETURN result;
END;
$$;

DROP FUNCTION IF EXISTS public.get_student_dashboard_stats(uuid);
CREATE OR REPLACE FUNCTION public.get_student_dashboard_stats(
  student_uuid uuid,
  term_uuid uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
BEGIN
  SELECT json_build_object(
    'term_id', v_term,
    'enrolled_courses', (
      SELECT COUNT(*) FROM enrollments WHERE user_id = student_uuid
    ),
    'xp_points', (
      SELECT COALESCE(total_points, 0) FROM user_points WHERE portal_user_id = student_uuid
    ),
    'current_streak', (
      SELECT COALESCE(current_streak, 0) FROM user_points WHERE portal_user_id = student_uuid
    ),
    'achievement_level', (
      SELECT COALESCE(achievement_level, 'Bronze') FROM user_points WHERE portal_user_id = student_uuid
    ),
    'lessons_completed', (
      SELECT COUNT(*) FROM lesson_progress
      WHERE portal_user_id = student_uuid AND status = 'completed'
    ),
    'pending_assignments', (
      SELECT COUNT(*)
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.portal_user_id = student_uuid
        AND s.status = 'submitted'
        AND s.grade IS NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    ),
    'avg_score', (
      SELECT COALESCE(
        AVG((s.grade::float / NULLIF(a.max_points, 0)) * 100)::integer,
        0
      )
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.portal_user_id = student_uuid
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    ),
    'badges_count', (
      SELECT COUNT(*) FROM user_badges WHERE portal_user_id = student_uuid
    ),
    'leaderboard_rank', (
      SELECT rank FROM (
        SELECT portal_user_id,
               ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank
        FROM user_points
      ) lb WHERE portal_user_id = student_uuid
    )
  ) INTO result;

  RETURN result;
END;
$$;

DROP FUNCTION IF EXISTS public.get_school_dashboard_stats(uuid, text);
CREATE OR REPLACE FUNCTION public.get_school_dashboard_stats(
  school_uuid uuid,
  school_name_param text DEFAULT NULL,
  term_uuid uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
BEGIN
  SELECT json_build_object(
    'term_id', v_term,
    'total_students', (
      SELECT COUNT(*) FROM students
      WHERE school_id = school_uuid
         OR (school_name_param IS NOT NULL AND school_name = school_name_param)
    ),
    'portal_students', (
      SELECT COUNT(*) FROM portal_users
      WHERE role = 'student' AND school_id = school_uuid
    ),
    'assigned_teachers', (
      SELECT COUNT(*) FROM teacher_schools WHERE school_id = school_uuid
    ),
    'total_classes', (
      SELECT COUNT(*) FROM classes
      WHERE school_id = school_uuid
        AND public.assignment_matches_term(term_id, v_term)
    ),
    'avg_performance', (
      SELECT COALESCE(AVG((s.grade::float / NULLIF(a.max_points, 0)) * 100), 0)::integer
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
      WHERE u.school_id = school_uuid
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    ),
    'submissions_count', (
      SELECT COUNT(*)
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
      WHERE u.school_id = school_uuid
        AND s.grade IS NOT NULL
        AND public.assignment_matches_term(a.term_id, v_term)
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Exact admin graded counts for live session (no sample cap)
CREATE OR REPLACE FUNCTION public.get_admin_session_graded_counts(
  term_uuid uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
  v_asn bigint;
  v_cbt bigint;
BEGIN
  SELECT COUNT(*) INTO v_asn
  FROM assignment_submissions s
  JOIN assignments a ON a.id = s.assignment_id
  WHERE s.grade IS NOT NULL
    AND public.assignment_matches_term(a.term_id, v_term);

  SELECT COUNT(*) INTO v_cbt
  FROM cbt_sessions cs
  JOIN cbt_exams e ON e.id = cs.exam_id
  WHERE cs.score IS NOT NULL
    AND public.cbt_session_matches_term(cs.end_time, e.metadata, v_term);

  RETURN json_build_object(
    'term_id', v_term,
    'graded_assignments', v_asn,
    'graded_cbt', v_cbt,
    'total_graded', v_asn + v_cbt
  );
END;
$$;

-- Activity feed: only live-session submissions
CREATE OR REPLACE FUNCTION public.get_dashboard_activity(
  user_role text,
  user_uuid uuid,
  activity_limit integer DEFAULT 6
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  time_ago text,
  icon_type text,
  color_class text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term uuid := public.live_academic_term_id();
BEGIN
  IF user_role = 'admin' THEN
    RETURN QUERY
    SELECT
      s.id,
      COALESCE(u.full_name, 'Student') || ' submitted' AS title,
      COALESCE(a.title, '—') AS description,
      CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::text || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::text || 'h ago'
        ELSE
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::text || 'd ago'
      END AS time_ago,
      'submission'::text AS icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END AS color_class,
      s.submitted_at AS created_at
    FROM assignment_submissions s
    LEFT JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE public.assignment_matches_term(a.term_id, v_term)
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;

  ELSIF user_role = 'teacher' THEN
    RETURN QUERY
    SELECT
      s.id,
      COALESCE(u.full_name, 'Student') || ' submitted' AS title,
      COALESCE(a.title, '—') AS description,
      CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::text || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::text || 'h ago'
        ELSE
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::text || 'd ago'
      END AS time_ago,
      'submission'::text AS icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END AS color_class,
      s.submitted_at AS created_at
    FROM assignment_submissions s
    LEFT JOIN portal_users u ON u.id = COALESCE(s.portal_user_id, s.user_id)
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE a.created_by = user_uuid
      AND public.assignment_matches_term(a.term_id, v_term)
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;

  ELSIF user_role = 'student' THEN
    RETURN QUERY
    SELECT
      s.id,
      CASE WHEN s.status = 'graded' THEN 'Grade received' ELSE 'Assignment submitted' END AS title,
      COALESCE(a.title, '—') ||
        CASE WHEN s.grade IS NOT NULL
          THEN ' · ' || s.grade::text || '/' || COALESCE(a.max_points, 100)::text
          ELSE ''
        END AS description,
      CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 60 THEN 'just now'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 3600 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 60)::text || 'm ago'
        WHEN EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) < 86400 THEN
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 3600)::text || 'h ago'
        ELSE
          FLOOR(EXTRACT(EPOCH FROM (NOW() - s.submitted_at)) / 86400)::text || 'd ago'
      END AS time_ago,
      CASE WHEN s.status = 'graded' THEN 'trophy' ELSE 'submission' END AS icon_type,
      CASE WHEN s.status = 'graded' THEN 'emerald' ELSE 'orange' END AS color_class,
      s.submitted_at AS created_at
    FROM assignment_submissions s
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE s.portal_user_id = user_uuid
      AND public.assignment_matches_term(a.term_id, v_term)
    ORDER BY s.submitted_at DESC
    LIMIT activity_limit;
  END IF;
END;
$$;

-- At-risk: overdue assignments limited to live session
DROP FUNCTION IF EXISTS public.get_at_risk_students(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_at_risk_students(
  p_school_id uuid,
  p_class_id uuid DEFAULT NULL
)
RETURNS TABLE (
  portal_user_id uuid,
  full_name text,
  triggered_signals jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH live_term AS (
    SELECT public.live_academic_term_id() AS term_id
  ),
  students AS (
    SELECT
      pu.id,
      pu.full_name,
      pu.last_login,
      pu.class_id
    FROM public.portal_users pu
    WHERE pu.role = 'student'
      AND pu.school_id = p_school_id
      AND (p_class_id IS NULL OR pu.class_id = p_class_id)
      AND pu.is_deleted = false
  ),
  no_login_signals AS (
    SELECT s.id AS student_id, 'no_login'::text AS signal
    FROM students s
    WHERE s.last_login IS NULL
       OR s.last_login < now() - interval '7 days'
  ),
  attendance_stats AS (
    SELECT
      a.student_id,
      count(*) AS total_records,
      count(*) FILTER (WHERE a.status = 'absent') AS absent_count
    FROM public.attendance a
    INNER JOIN students s ON s.id = a.student_id
    WHERE a.created_at >= now() - interval '30 days'
    GROUP BY a.student_id
  ),
  low_attendance_signals AS (
    SELECT ast.student_id, 'low_attendance'::text AS signal
    FROM attendance_stats ast
    WHERE ast.total_records > 0
      AND (ast.absent_count::float / ast.total_records) > 0.30
  ),
  overdue_assignments AS (
    SELECT s.id AS student_id, asgn.id AS assignment_id
    FROM students s
    INNER JOIN public.assignments asgn ON asgn.class_id = s.class_id
    CROSS JOIN live_term lt
    WHERE asgn.due_date < now()
      AND asgn.is_active = true
      AND public.assignment_matches_term(asgn.term_id, lt.term_id)
  ),
  submitted_assignments AS (
    SELECT DISTINCT oa.student_id, oa.assignment_id
    FROM overdue_assignments oa
    INNER JOIN public.assignment_submissions asub
      ON asub.assignment_id = oa.assignment_id
     AND (asub.portal_user_id = oa.student_id OR asub.user_id = oa.student_id)
  ),
  overdue_counts AS (
    SELECT oa.student_id, count(*) AS overdue_count
    FROM overdue_assignments oa
    LEFT JOIN submitted_assignments sa
      ON sa.student_id = oa.student_id
     AND sa.assignment_id = oa.assignment_id
    WHERE sa.assignment_id IS NULL
    GROUP BY oa.student_id
  ),
  overdue_signals AS (
    SELECT oc.student_id, 'overdue_assignments'::text AS signal
    FROM overdue_counts oc
    WHERE oc.overdue_count >= 2
  ),
  all_signals AS (
    SELECT student_id, signal FROM no_login_signals
    UNION ALL
    SELECT student_id, signal FROM low_attendance_signals
    UNION ALL
    SELECT student_id, signal FROM overdue_signals
  ),
  aggregated_signals AS (
    SELECT als.student_id, jsonb_agg(als.signal ORDER BY als.signal) AS signals
    FROM all_signals als
    GROUP BY als.student_id
  )
  SELECT
    s.id AS portal_user_id,
    s.full_name,
    coalesce(ags.signals, '[]'::jsonb) AS triggered_signals
  FROM students s
  INNER JOIN aggregated_signals ags ON ags.student_id = s.id
  ORDER BY s.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_dashboard_stats(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_dashboard_stats(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_school_dashboard_stats(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_session_graded_counts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_activity(text, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_at_risk_students(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_teacher_dashboard_stats(uuid, uuid) IS
  'Teacher dashboard stats scoped to academic year + term (defaults to live session).';
COMMENT ON FUNCTION public.get_student_dashboard_stats(uuid, uuid) IS
  'Student dashboard stats scoped to academic year + term (defaults to live session).';
COMMENT ON FUNCTION public.get_school_dashboard_stats(uuid, text, uuid) IS
  'School dashboard stats scoped to academic year + term (defaults to live session).';
COMMENT ON FUNCTION public.get_admin_session_graded_counts(uuid) IS
  'Exact admin graded assignment + CBT counts for one academic session.';
COMMENT ON TABLE public.enrollment_term_grades IS
  'Program enrollment letter grades keyed by academic session (year + term). enrollments.grade mirrors the live session.';
