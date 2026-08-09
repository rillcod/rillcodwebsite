-- One named rule for "is this class part of this term", used everywhere.
--
-- Two counters had already got this wrong in the same way, and I fixed them one
-- at a time (20260929000054, ...055) by inlining the same EXISTS twice. That is
-- how the third one gets written differently, so the rule gets a name.
--
-- There are genuinely TWO rules here, and conflating them is what caused the
-- original bug:
--
--   assignment_matches_term  — work belongs to the term it was set in. An
--     assignment, submission or exam written in Third Term stays Third Term
--     work for ever. Exact match, or null. Unchanged; still correct.
--
--   class_active_for_term    — a CLASS carries forward. The same Basic 1 class
--     teaches this term and the next, so it belongs to the live term and to
--     every term after it. Applying the assignment rule to classes is what made
--     every dashboard read zero the moment the classes were rolled into next
--     term while the calendar still pointed at the one that had just ended.
--
-- A class with no term counts: duration programmes and short courses run off
-- offering periods rather than the school term spine, and excluding them would
-- hide real teaching.
--
-- IMMUTABLE is deliberately not claimed — this reads academic_terms, so it is
-- STABLE. Marking it immutable would let the planner cache a result across a
-- term boundary.

CREATE OR REPLACE FUNCTION public.class_active_for_term(p_class_term_id uuid, p_term_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    p_term_id IS NULL
    OR p_class_term_id IS NULL
    OR p_class_term_id = p_term_id
    OR EXISTS (
      SELECT 1
      FROM public.academic_terms class_term, public.academic_terms live_term
      WHERE class_term.id = p_class_term_id
        AND live_term.id = p_term_id
        AND class_term.start_date IS NOT NULL
        AND live_term.start_date IS NOT NULL
        AND class_term.start_date >= live_term.start_date
    );
$function$;

COMMENT ON FUNCTION public.class_active_for_term(uuid, uuid) IS
  'Whether a class belongs to a term for counting purposes: the same term, any term after it, or no term at all. Classes carry forward between terms — use assignment_matches_term for work, which does not.';

GRANT EXECUTE ON FUNCTION public.class_active_for_term(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.class_active_for_term(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.class_active_for_term(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_active_for_term(uuid, uuid) TO service_role;

-- Both counters now call the rule instead of restating it.

CREATE OR REPLACE FUNCTION public.get_teacher_dashboard_stats(teacher_uuid uuid, term_uuid uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND public.assignment_matches_term(e.term_id, v_term);

  SELECT json_build_object(
    'term_id', v_term,
    'classes', (
      SELECT COUNT(*) FROM classes c
      WHERE c.teacher_id = teacher_uuid
        AND COALESCE(c.status, '') <> 'archived'
        AND public.class_active_for_term(c.term_id, v_term)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_school_dashboard_stats(school_uuid uuid, school_name_param text DEFAULT NULL::text, term_uuid uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      SELECT COUNT(*) FROM classes c
      WHERE c.school_id = school_uuid
        AND COALESCE(c.status, '') <> 'archived'
        AND public.class_active_for_term(c.term_id, v_term)
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
$function$;
