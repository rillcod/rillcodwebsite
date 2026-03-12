-- =============================================
-- FIX: Ensure ALL authenticated staff can read assignment_submissions
-- Uses direct role check instead of is_staff() function to avoid any dependency issues
-- =============================================

-- Drop the previous policy attempts
DROP POLICY IF EXISTS "Staff can manage submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students view own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students insert own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students update own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students can view their submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students can submit assignments" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Admins can manage submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Teachers can grade submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "submissions_staff_all" ON public.assignment_submissions;
DROP POLICY IF EXISTS "submissions_student_select" ON public.assignment_submissions;
DROP POLICY IF EXISTS "submissions_student_insert" ON public.assignment_submissions;
DROP POLICY IF EXISTS "submissions_student_update" ON public.assignment_submissions;

-- Single permissive SELECT: staff see all, students see their own
DROP POLICY IF EXISTS "submissions_read" ON public.assignment_submissions;
CREATE POLICY "submissions_read"
  ON public.assignment_submissions
  FOR SELECT TO authenticated
  USING (
    -- Staff (admin, teacher, school) can read everything
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid()
        AND role IN ('admin', 'teacher', 'school')
    )
    -- Students can read their own (either column)
    OR portal_user_id = auth.uid()
    OR user_id = auth.uid()
  );

-- Staff: can insert/update/delete
DROP POLICY IF EXISTS "submissions_staff_write" ON public.assignment_submissions;
CREATE POLICY "submissions_staff_write"
  ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid()
        AND role IN ('admin', 'teacher', 'school')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portal_users
      WHERE id = auth.uid()
        AND role IN ('admin', 'teacher', 'school')
    )
  );

-- Students: can insert their own submission
DROP POLICY IF EXISTS "submissions_student_insert" ON public.assignment_submissions;
CREATE POLICY "submissions_student_insert"
  ON public.assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    portal_user_id = auth.uid()
    OR user_id = auth.uid()
  );

-- Students: can update their own submission (resubmit)
DROP POLICY IF EXISTS "submissions_student_update" ON public.assignment_submissions;
CREATE POLICY "submissions_student_update"
  ON public.assignment_submissions
  FOR UPDATE TO authenticated
  USING (
    portal_user_id = auth.uid()
    OR user_id = auth.uid()
  );

GRANT ALL ON public.assignment_submissions TO authenticated, service_role;
