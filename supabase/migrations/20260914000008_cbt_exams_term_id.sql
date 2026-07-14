-- First-class academic session on CBT exams (year + term).
-- Prefer column over metadata.term_id; keep metadata in sync for older clients.

ALTER TABLE public.cbt_exams
  ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cbt_exams_term_id ON public.cbt_exams (term_id);

-- Backfill from metadata.term_id / academic_term_id, else live calendar session.
UPDATE public.cbt_exams e
SET term_id = COALESCE(
  NULLIF(btrim(COALESCE(e.metadata ->> 'term_id', e.metadata ->> 'academic_term_id', '')), '')::uuid,
  public.live_academic_term_id()
)
WHERE e.term_id IS NULL
  AND (
    NULLIF(btrim(COALESCE(e.metadata ->> 'term_id', e.metadata ->> 'academic_term_id', '')), '') IS NOT NULL
    OR public.live_academic_term_id() IS NOT NULL
  );

-- Mirror column back into metadata when missing.
UPDATE public.cbt_exams e
SET metadata = COALESCE(e.metadata, '{}'::jsonb) || jsonb_build_object('term_id', e.term_id::text)
WHERE e.term_id IS NOT NULL
  AND NULLIF(btrim(COALESCE(e.metadata ->> 'term_id', '')), '') IS NULL;

-- Prefer first-class exam.term_id in session matcher (4th arg optional).
DROP FUNCTION IF EXISTS public.cbt_session_matches_term(timestamptz, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.cbt_session_matches_term(
  p_end_time timestamptz,
  p_metadata jsonb,
  p_term_id uuid,
  p_exam_term_id uuid DEFAULT NULL
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

  IF p_exam_term_id IS NOT NULL THEN
    RETURN p_exam_term_id = p_term_id;
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

GRANT EXECUTE ON FUNCTION public.cbt_session_matches_term(timestamptz, jsonb, uuid, uuid) TO authenticated, service_role;

-- Patch teacher dashboard exam filter to prefer column (keep original return shape).
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
    AND public.assignment_matches_term(e.term_id, v_term);

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

CREATE OR REPLACE FUNCTION public.get_admin_session_graded_counts(
  term_uuid uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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
    AND public.cbt_session_matches_term(cs.end_time, e.metadata, v_term, e.term_id);

  RETURN json_build_object(
    'term_id', v_term,
    'graded_assignments', v_asn,
    'graded_cbt', v_cbt,
    'total_graded', v_asn + v_cbt
  );
END;
$$;

COMMENT ON COLUMN public.cbt_exams.term_id IS
  'Academic session (year + term). Prefer over metadata.term_id for isolation.';
