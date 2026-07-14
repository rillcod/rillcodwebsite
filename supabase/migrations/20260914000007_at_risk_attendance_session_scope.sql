-- Scope at-risk attendance to the live academic session (year + term),
-- and match attendance on user_id OR student_id (both are portal_users.id in practice).

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
      s.id AS student_id,
      count(*) AS total_records,
      count(*) FILTER (WHERE a.status = 'absent') AS absent_count
    FROM students s
    INNER JOIN public.attendance a
      ON (a.user_id = s.id OR a.student_id = s.id)
    CROSS JOIN live_term lt
    WHERE a.created_at >= now() - interval '30 days'
      AND (
        lt.term_id IS NULL
        OR a.term_id = lt.term_id
        OR a.term_id IS NULL
      )
    GROUP BY s.id
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

GRANT EXECUTE ON FUNCTION public.get_at_risk_students(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_at_risk_students(uuid, uuid) IS
  'At-risk signals: overdue assignments + attendance scoped to live academic year+term.';
