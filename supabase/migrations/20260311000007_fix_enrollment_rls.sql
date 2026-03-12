-- =============================================
-- FIX: Enrollment Policies visibility for teachers
-- =============================================

DROP POLICY IF EXISTS "Staff can manage enrollments" ON public.enrollments;
CREATE POLICY "Staff can manage enrollments" ON public.enrollments
  FOR ALL TO authenticated USING (is_staff());

DROP POLICY IF EXISTS "Students can view own enrollments" ON public.enrollments;
CREATE POLICY "Students can view own enrollments" ON public.enrollments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Ensure students are visible via portal_users to teachers always
DROP POLICY IF EXISTS "Staff can view student users" ON public.portal_users;
CREATE POLICY "Staff can view student users" ON public.portal_users
  FOR SELECT TO authenticated USING (is_staff());

-- Give school managers visibility over their school's users
DROP POLICY IF EXISTS "School managers can view their staff and students" ON public.portal_users;
CREATE POLICY "School managers can view their staff and students" ON public.portal_users
  FOR SELECT TO authenticated USING (
    (SELECT role FROM portal_users WHERE id = auth.uid()) = 'school' 
    AND school_id = (SELECT school_id FROM portal_users WHERE id = auth.uid())
  );
