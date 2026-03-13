-- FINAL COMPREHENSIVE RLS POLICIES
-- Ensuring Staff (Teachers/Schools) can only manage THEIR resources.
-- EXPLICIT Bypass for Admins on all management actions.

BEGIN;

-- 1. Helper for school partners
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
BEGIN
  RETURN (SELECT school_id FROM portal_users WHERE id = auth.uid());
END; $$;

-- 2. Students: Staff (Own/School) + ADMIN Management
DROP POLICY IF EXISTS "select_students_staff" ON public.students;
DROP POLICY IF EXISTS "manage_students_staff_own" ON public.students;
DROP POLICY IF EXISTS "manage_students_admin_teacher" ON public.students;
DROP POLICY IF EXISTS "manage_students_school" ON public.students;

CREATE POLICY "select_students_staff" ON public.students FOR SELECT USING (is_staff());
CREATE POLICY "manage_students_staff_adn_admin" ON public.students 
FOR ALL USING (
  is_admin() OR 
  created_by = auth.uid() OR 
  school_id = get_my_school_id()
);

-- 3. Classes: Teacher/School + ADMIN Management
DROP POLICY IF EXISTS "select_classes_staff" ON public.classes;
DROP POLICY IF EXISTS "manage_classes_admin" ON public.classes;
DROP POLICY IF EXISTS "manage_classes_teacher" ON public.classes;
DROP POLICY IF EXISTS "manage_classes_school" ON public.classes;

CREATE POLICY "select_classes_staff" ON public.classes FOR SELECT USING (is_staff());
CREATE POLICY "manage_classes_staff_and_admin" ON public.classes 
FOR ALL USING (
  is_admin() OR 
  teacher_id = auth.uid() OR 
  school_id = get_my_school_id()
);

-- 4. Assignments: Creator/School + ADMIN Management
DROP POLICY IF EXISTS "select_assignments_all" ON public.assignments;
DROP POLICY IF EXISTS "manage_assignments_staff" ON public.assignments;

CREATE POLICY "select_assignments_all" ON public.assignments FOR SELECT USING (true);
CREATE POLICY "manage_assignments_staff_and_admin" ON public.assignments 
FOR ALL USING (
  is_admin() OR 
  created_by = auth.uid() OR 
  school_id = get_my_school_id()
);

-- 5. CBT Exams: Course Owner/School + ADMIN Management
DROP POLICY IF EXISTS "manage_cbt_staff" ON public.cbt_exams;
CREATE POLICY "manage_cbt_staff_and_admin" ON public.cbt_exams 
FOR ALL USING (
  is_admin() OR
  EXISTS (
    SELECT 1 FROM public.courses c 
    WHERE c.id = cbt_exams.course_id 
    AND (c.teacher_id = auth.uid() OR c.school_id = get_my_school_id())
  )
);

-- 6. Assignment Submissions (Grading): Owner + ADMIN
DROP POLICY IF EXISTS "update_submissions_staff_own" ON public.assignment_submissions;
DROP POLICY IF EXISTS "update_submissions_staff" ON public.assignment_submissions;

CREATE POLICY "grade_submissions_staff_and_admin" ON public.assignment_submissions 
FOR UPDATE USING (
  is_admin() OR
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_submissions.assignment_id
    AND (a.created_by = auth.uid() OR a.school_id = get_my_school_id())
  )
);

-- 7. Reports: Owner + ADMIN
DROP POLICY IF EXISTS "manage_reports_staff_own" ON public.generated_reports;
DROP POLICY IF EXISTS "manage_reports_admin" ON public.generated_reports;

CREATE POLICY "manage_generated_reports_staff_and_admin" ON public.generated_reports 
FOR ALL USING (
  is_admin() OR 
  generated_by = auth.uid()
);

-- 8. Progress Reports: Teacher/School + ADMIN
DROP POLICY IF EXISTS "manage_progress_reports_staff" ON public.student_progress_reports;
CREATE POLICY "manage_progress_reports_staff_and_admin" ON public.student_progress_reports 
FOR ALL USING (
  is_admin() OR
  teacher_id = auth.uid() OR
  school_id = get_my_school_id()
);

COMMIT;
