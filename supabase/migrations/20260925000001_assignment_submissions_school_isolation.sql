-- ─────────────────────────────────────────────────────────────────────────────
-- Assignment submissions — end-to-end school / class isolation
--
-- Closes:
--   1. Role-wide submissions_read / submissions_staff_write (any teacher saw all)
--   2. Student UPDATE that could overwrite grade / status / weighted_score
--   3. anon GRANT ALL on assignment_submissions
--   4. Role-wide "Teachers/Staff can manage assignments" write policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: may this staff user access this assignment (grade / read submissions)?
CREATE OR REPLACE FUNCTION public.staff_can_access_assignment(a public.assignments)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'admin'
    )
    OR
    -- School account: same school only
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'school'
        AND pu.school_id IS NOT NULL
        AND pu.school_id = a.school_id
    )
    OR
    -- Teacher: creator, class owner, or school-wide (no class) at their school
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'teacher'
        AND (
          a.created_by = pu.id
          OR EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.teacher_id = pu.id
              AND c.id = COALESCE(
                (
                  SELECT c2.id
                  FROM public.classes c2
                  WHERE c2.id::text = NULLIF(trim(a.metadata ->> 'target_class_id'), '')
                  LIMIT 1
                ),
                a.class_id
              )
          )
          OR (
            COALESCE(
              (
                SELECT c3.id
                FROM public.classes c3
                WHERE c3.id::text = NULLIF(trim(a.metadata ->> 'target_class_id'), '')
                LIMIT 1
              ),
              a.class_id
            ) IS NULL
            AND a.school_id IS NOT NULL
            AND (
              pu.school_id = a.school_id
              OR EXISTS (
                SELECT 1 FROM public.teacher_schools ts
                WHERE ts.teacher_id = pu.id AND ts.school_id = a.school_id
              )
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.staff_can_access_assignment(public.assignments) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_can_access_assignment(public.assignments) TO authenticated;

-- Block students from tampering with grade fields on UPDATE (client or forged request).
CREATE OR REPLACE FUNCTION public.prevent_student_submission_grade_tamper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT pu.role INTO caller_role
  FROM public.portal_users pu
  WHERE pu.id = auth.uid();

  -- Staff / service role: allow full updates
  IF caller_role IS NULL OR caller_role IN ('admin', 'teacher', 'school') THEN
    RETURN NEW;
  END IF;

  -- Students (and any non-staff) cannot change grading fields
  NEW.grade := OLD.grade;
  NEW.weighted_score := OLD.weighted_score;
  NEW.graded_by := OLD.graded_by;
  NEW.graded_at := OLD.graded_at;
  NEW.feedback := OLD.feedback;
  NEW.ai_suggested_grade := OLD.ai_suggested_grade;
  NEW.ai_suggested_feedback := OLD.ai_suggested_feedback;
  NEW.grading_mode := OLD.grading_mode;

  -- Once graded, freeze status; otherwise only allow student-facing statuses
  IF OLD.status = 'graded' THEN
    NEW.status := OLD.status;
  ELSIF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status NOT IN ('submitted', 'late', 'missing') THEN
    NEW.status := OLD.status;
  END IF;

  -- Never let a student reassign ownership
  NEW.portal_user_id := OLD.portal_user_id;
  NEW.user_id := OLD.user_id;
  NEW.assignment_id := OLD.assignment_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_student_submission_grade_tamper ON public.assignment_submissions;
CREATE TRIGGER trg_prevent_student_submission_grade_tamper
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_student_submission_grade_tamper();

-- ── Replace weak submission policies ──────────────────────────────────────────
DROP POLICY IF EXISTS "submissions_read" ON public.assignment_submissions;
DROP POLICY IF EXISTS "submissions_staff_write" ON public.assignment_submissions;
DROP POLICY IF EXISTS "submissions_student_insert" ON public.assignment_submissions;
DROP POLICY IF EXISTS "submissions_student_update" ON public.assignment_submissions;
DROP POLICY IF EXISTS "parent_read_child_submissions" ON public.assignment_submissions;

-- Student / owner read
CREATE POLICY "submissions_select_own"
  ON public.assignment_submissions
  FOR SELECT TO authenticated
  USING (
    portal_user_id = auth.uid()
    OR user_id = auth.uid()
  );

-- Parent read linked children
CREATE POLICY "submissions_select_parent"
  ON public.assignment_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_parent()
    AND portal_user_id IN (SELECT public.get_parent_child_user_ids())
  );

-- Staff read — school / class scoped via assignment
CREATE POLICY "submissions_select_staff"
  ON public.assignment_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_submissions.assignment_id
        AND public.staff_can_access_assignment(a)
    )
  );

-- Student insert — own row only, no grade payload
CREATE POLICY "submissions_insert_own"
  ON public.assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    (portal_user_id = auth.uid() OR user_id = auth.uid())
    AND grade IS NULL
    AND weighted_score IS NULL
    AND graded_by IS NULL
    AND graded_at IS NULL
    AND (status IS NULL OR status IN ('submitted', 'late', 'missing'))
  );

-- Student update — own row only (grade freeze enforced by trigger)
CREATE POLICY "submissions_update_own"
  ON public.assignment_submissions
  FOR UPDATE TO authenticated
  USING (portal_user_id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (portal_user_id = auth.uid() OR user_id = auth.uid());

-- Staff insert / update / delete — must access the assignment
CREATE POLICY "submissions_write_staff"
  ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_submissions.assignment_id
        AND public.staff_can_access_assignment(a)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_submissions.assignment_id
        AND public.staff_can_access_assignment(a)
    )
  );

REVOKE ALL ON TABLE public.assignment_submissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assignment_submissions TO authenticated;
GRANT ALL ON TABLE public.assignment_submissions TO service_role;

-- ── Tighten assignment write policies (teachers cannot manage every school) ──
DROP POLICY IF EXISTS "Teachers can manage assignments" ON public.assignments;
DROP POLICY IF EXISTS "Staff can manage assignments" ON public.assignments;

-- Admin keep existing is_admin() policy if present; add scoped staff writes
CREATE POLICY "assignments_write_admin"
  ON public.assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_users pu WHERE pu.id = auth.uid() AND pu.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_users pu WHERE pu.id = auth.uid() AND pu.role = 'admin'));

-- Teachers may insert for their schools; update/delete only own creations
CREATE POLICY "assignments_insert_teacher"
  ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'teacher'
        AND created_by = pu.id
        AND (
          school_id IS NULL
          OR pu.school_id = school_id
          OR EXISTS (
            SELECT 1 FROM public.teacher_schools ts
            WHERE ts.teacher_id = pu.id AND ts.school_id = assignments.school_id
          )
        )
    )
  );

CREATE POLICY "assignments_update_own_teacher"
  ON public.assignments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'teacher' AND created_by = pu.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'teacher' AND created_by = pu.id
    )
  );

CREATE POLICY "assignments_delete_own_teacher"
  ON public.assignments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'teacher' AND created_by = pu.id
    )
  );

-- Staff SELECT for teachers/school (so client dashboards work with new boundary)
DROP POLICY IF EXISTS "assignments_select_staff_scoped" ON public.assignments;
CREATE POLICY "assignments_select_staff_scoped"
  ON public.assignments
  FOR SELECT TO authenticated
  USING (public.staff_can_access_assignment(assignments));
