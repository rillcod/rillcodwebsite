CREATE TABLE IF NOT EXISTS public.student_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  from_class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  to_class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  from_teacher_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE RESTRICT,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  decision_note text,
  decided_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_class_id <> to_class_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_student_transfer
  ON public.student_transfer_requests(student_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transfer_requests_from_teacher
  ON public.student_transfer_requests(from_teacher_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_requester
  ON public.student_transfer_requests(requested_by, status, created_at DESC);

ALTER TABLE public.student_transfer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_transfer_requests FROM anon, authenticated;
GRANT ALL ON public.student_transfer_requests TO service_role;

CREATE OR REPLACE FUNCTION public.decide_student_transfer_request(
  p_request_id uuid,
  p_actor_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS public.student_transfer_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.student_transfer_requests;
  actor_role text;
  dest public.classes;
  live_count integer;
BEGIN
  SELECT * INTO req FROM public.student_transfer_requests WHERE id = p_request_id FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Transfer request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Transfer request has already been decided'; END IF;

  SELECT role INTO actor_role FROM public.portal_users
  WHERE id = p_actor_id AND NOT coalesce(is_deleted, false) AND coalesce(is_active, true);
  IF actor_role <> 'admin' AND req.from_teacher_id <> p_actor_id THEN
    RAISE EXCEPTION 'Only the current owning teacher or an admin may decide this request';
  END IF;

  IF p_approve THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_users student
      JOIN public.classes source ON source.id = student.class_id
      WHERE student.id = req.student_id AND student.role = 'student'
        AND student.class_id = req.from_class_id AND source.teacher_id = req.from_teacher_id
    ) THEN
      RAISE EXCEPTION 'Student ownership changed after this request was created; refresh and submit a new request';
    END IF;

    SELECT * INTO dest FROM public.classes WHERE id = req.to_class_id FOR UPDATE;
    IF dest.id IS NULL OR dest.teacher_id IS NULL THEN RAISE EXCEPTION 'Destination class has no valid owner'; END IF;
    IF dest.school_id <> req.school_id THEN RAISE EXCEPTION 'Cross-school transfer is forbidden'; END IF;

    SELECT count(*) INTO live_count FROM public.portal_users
    WHERE role = 'student' AND class_id = dest.id AND NOT coalesce(is_deleted, false);
    IF dest.max_students IS NOT NULL AND dest.max_students > 0 AND live_count >= dest.max_students THEN
      RAISE EXCEPTION 'Destination class is full';
    END IF;

    UPDATE public.portal_users SET
      class_id = dest.id,
      school_id = dest.school_id,
      section_class = dest.name,
      primary_teacher_id = dest.teacher_id,
      updated_at = now()
    WHERE id = req.student_id AND role = 'student';

    UPDATE public.students SET
      school_id = dest.school_id,
      school_name = (SELECT name FROM public.schools WHERE id = dest.school_id),
      current_class = dest.name,
      grade_level = coalesce(grade_level, dest.qa_grade_band),
      updated_at = now()
    WHERE user_id = req.student_id;

    IF to_regclass('public.class_term_rosters') IS NOT NULL THEN
      EXECUTE 'UPDATE public.class_term_rosters SET status = ''withdrawn'', ended_at = now(), updated_by = $1 WHERE student_id = $2 AND class_id = $3 AND status = ''active'''
        USING p_actor_id, req.student_id, req.from_class_id;
    END IF;

    UPDATE public.classes c SET current_students = (
      SELECT count(*) FROM public.portal_users pu
      WHERE pu.role = 'student' AND pu.class_id = c.id AND NOT coalesce(pu.is_deleted, false)
    ), updated_at = now()
    WHERE c.id IN (req.from_class_id, req.to_class_id);
  END IF;

  UPDATE public.student_transfer_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
    decision_note = nullif(btrim(p_note), ''),
    decided_by = p_actor_id,
    decided_at = now(),
    updated_at = now()
  WHERE id = req.id
  RETURNING * INTO req;

  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, new_values)
  VALUES (p_actor_id, CASE WHEN p_approve THEN 'student_transfer_approved' ELSE 'student_transfer_declined' END,
          'student_transfer_requests', req.id,
          jsonb_build_object('student_id', req.student_id, 'from_class_id', req.from_class_id, 'to_class_id', req.to_class_id, 'note', p_note));

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_student_transfer_request(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_student_transfer_request(uuid, uuid, boolean, text) TO service_role;
