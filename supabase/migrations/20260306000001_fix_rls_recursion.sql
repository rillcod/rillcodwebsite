-- =============================================
-- Fix: Infinite recursion in portal_users RLS
-- =============================================
-- Root cause: "Admins can manage all users" policy on portal_users does:
--   EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
-- This self-references portal_users, triggering the same policy → infinite recursion.
--
-- Fix: Create a SECURITY DEFINER function that bypasses RLS when checking the role.
-- All admin checks across all tables then use this function.

-- 1. Create security definer function to get current user's role
--    SECURITY DEFINER runs as the function owner (postgres), bypassing RLS.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.portal_users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role = 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- Helper: check if current user is admin or teacher
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher'));
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;

-- 2. Fix portal_users policies — remove self-referencing queries
DROP POLICY IF EXISTS "Admins can manage all users" ON public.portal_users;
CREATE POLICY "Admins can manage all users" ON public.portal_users
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Staff can view all users" ON public.portal_users;
CREATE POLICY "Staff can view all users" ON public.portal_users
  FOR SELECT USING (is_staff());

-- 3. Fix programs policies
DROP POLICY IF EXISTS "Admins can manage programs" ON public.programs;
CREATE POLICY "Admins can manage programs" ON public.programs
  FOR ALL USING (is_admin());

-- 4. Fix courses policies
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;
CREATE POLICY "Admins can manage courses" ON public.courses
  FOR ALL USING (is_admin());

-- 5. Fix course_materials policies
DROP POLICY IF EXISTS "Admins can manage materials" ON public.course_materials;
CREATE POLICY "Admins can manage materials" ON public.course_materials
  FOR ALL USING (is_admin());

-- 6. Fix enrollments policies
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;
CREATE POLICY "Admins can manage enrollments" ON public.enrollments
  FOR ALL USING (is_admin());

-- 7. Fix assignments policies
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.assignments;
CREATE POLICY "Admins can manage assignments" ON public.assignments
  FOR ALL USING (is_admin());

-- 8. Fix assignment_submissions policies
DROP POLICY IF EXISTS "Admins can manage submissions" ON public.assignment_submissions;
CREATE POLICY "Admins can manage submissions" ON public.assignment_submissions
  FOR ALL USING (is_admin());

-- 9. Fix classes policies
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;
CREATE POLICY "Admins can manage classes" ON public.classes
  FOR ALL USING (is_admin());

-- 10. Fix class_sessions policies
DROP POLICY IF EXISTS "Admins can manage sessions" ON public.class_sessions;
CREATE POLICY "Admins can manage sessions" ON public.class_sessions
  FOR ALL USING (is_admin());

-- 11. Fix cbt_exams policies
DROP POLICY IF EXISTS "Admins can manage exams" ON public.cbt_exams;
CREATE POLICY "Admins can manage exams" ON public.cbt_exams
  FOR ALL USING (is_admin());

-- 12. Fix cbt_questions policies
DROP POLICY IF EXISTS "Admins can manage questions" ON public.cbt_questions;
CREATE POLICY "Admins can manage questions" ON public.cbt_questions
  FOR ALL USING (is_admin());

-- 13. Fix messages policies
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages" ON public.messages
  FOR ALL USING (is_admin());

-- 14. Fix announcements policies
DROP POLICY IF EXISTS "Staff can manage announcements" ON public.announcements;
CREATE POLICY "Staff can manage announcements" ON public.announcements
  FOR ALL USING (is_staff());

-- 15. Fix notifications policies
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
CREATE POLICY "Admins can manage notifications" ON public.notifications
  FOR ALL USING (is_admin());

-- 16. Fix students (legacy) policies
DROP POLICY IF EXISTS "Admins can manage students" ON public.students;
CREATE POLICY "Admins can manage students" ON public.students
  FOR ALL USING (is_admin());

-- 17. Fix lessons policies if they exist
DROP POLICY IF EXISTS "Staff can manage lessons" ON public.lessons;
CREATE POLICY "Staff can manage lessons" ON public.lessons
  FOR ALL USING (is_staff());

DROP POLICY IF EXISTS "Students can view active lessons" ON public.lessons;
CREATE POLICY "Students can view active lessons" ON public.lessons
  FOR SELECT USING (status = 'active' OR is_staff());
