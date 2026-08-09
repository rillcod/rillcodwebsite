-- A teacher's class count should be the classes they teach, now or next.
--
-- Two faults, pulling in opposite directions, so they had been hiding each other.
--
-- 1. The count matched classes to live_academic_term_id() exactly. Between terms
--    that is the term which has just ENDED — today is 9 Aug, Third Term closed on
--    5 Aug, First Term opens 1 Sept — while the classes themselves have been
--    rolled forward to the term they will teach. Nothing matched, and every
--    teacher's dashboard read 0 classes while they owned 4, 7, 9 and 12.
--
-- 2. It counted `teacher_id = me OR school_id = ANY(my schools)`, so a teacher saw
--    every class at every school they are attached to, not the ones they teach.
--    Osagie owns 9 across 6 schools and would have been shown 20; ZAINAB owns 7
--    and would have been shown 16. Removing only the term filter would have swung
--    the number from far too low to far too high.
--
-- The rule now: classes this teacher owns, not archived, in the live term or any
-- term after it. "Or after" is what makes the between-terms case work — a teacher
-- preparing September should see September's classes in August, not zero.
--
-- A class with no term is counted. Duration programmes and short courses run off
-- offering periods rather than the school term spine, and excluding them would
-- hide real teaching.

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
  v_term_start date;
BEGIN
  SELECT start_date INTO v_term_start FROM academic_terms WHERE id = v_term;

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
        AND (
          c.term_id IS NULL
          OR c.term_id = v_term
          OR v_term_start IS NULL
          OR EXISTS (
            SELECT 1 FROM academic_terms t
            WHERE t.id = c.term_id
              AND t.start_date IS NOT NULL
              AND t.start_date >= v_term_start
          )
        )
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

COMMENT ON FUNCTION public.get_teacher_dashboard_stats(uuid, uuid) IS
  'Teacher dashboard counters. Classes are the ones this teacher owns, not archived, in the live term or any term after it — so a teacher preparing next term sees it during the holidays rather than zero.';
