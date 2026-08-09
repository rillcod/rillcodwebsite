-- The school dashboard counts its classes, not the classes of a finished term.
--
-- Same fault as the teacher counter fixed in 20260929000054, and found by
-- sweeping for it: total_classes matched classes to live_academic_term_id()
-- through assignment_matches_term, which is exact — a class term either equals
-- the live term or is null.
--
-- Between terms that is the term which has just ENDED. Today is 9 Aug: Third
-- Term closed on 5 Aug, First Term opens 1 Sept, and the classes have been
-- rolled forward to the term they will teach. Every school read 0 classes while
-- running 1, 2, 3 and 5.
--
-- A shared helper is deliberately not introduced for this. assignment_matches_term
-- is used by assignments, submissions and exams elsewhere in these same
-- functions, where exact-or-null is the right rule: work belongs to the term it
-- was set in. Only classes carry forward, so only classes need "this term or
-- later", and widening the shared helper would quietly change what an assignment
-- counter means.

CREATE OR REPLACE FUNCTION public.get_school_dashboard_stats(school_uuid uuid, school_name_param text DEFAULT NULL::text, term_uuid uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_term uuid := COALESCE(term_uuid, public.live_academic_term_id());
  v_term_start date;
BEGIN
  SELECT start_date INTO v_term_start FROM academic_terms WHERE id = v_term;

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

COMMENT ON FUNCTION public.get_school_dashboard_stats(uuid, text, uuid) IS
  'School dashboard counters. Classes are the school''s own, not archived, in the live term or any term after it — so a school preparing next term sees it during the holidays rather than zero.';
