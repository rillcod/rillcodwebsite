-- =============================================
-- FIX: Staff & School Permissions for Classes, Enrollments, and Students
-- =============================================

-- 1. Update is_staff() to include 'school' role
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.portal_users WHERE id = auth.uid() AND role IN ('admin', 'teacher', 'school'));
$$;

-- 2. Allow staff (teachers/school manager) to update student portal records (e.g. for section assignment)
-- Specifically allow updating the student's section_class and school_id
DROP POLICY IF EXISTS "Staff can manage student users" ON public.portal_users;
CREATE POLICY "Staff can manage student users" ON public.portal_users
  FOR UPDATE 
  TO authenticated 
  USING (
    is_staff() AND (role = 'student')
  )
  WITH CHECK (
    is_staff() AND (role = 'student')
  );

-- 3. Allow staff to manage classes (not just admins)
DROP POLICY IF EXISTS "Staff can manage classes" ON public.classes;
CREATE POLICY "Staff can manage classes" ON public.classes
  FOR ALL 
  TO authenticated 
  USING (is_staff())
  WITH CHECK (is_staff());

-- 4. Allow staff to manage enrollments
DROP POLICY IF EXISTS "Staff can manage enrollments" ON public.enrollments;
CREATE POLICY "Staff can manage enrollments" ON public.enrollments
  FOR ALL 
  TO authenticated 
  USING (is_staff());

-- 5. Allow staff to manage class sessions
DROP POLICY IF EXISTS "Staff can manage class sessions" ON public.class_sessions;
CREATE POLICY "Staff can manage class sessions" ON public.class_sessions
  FOR ALL 
  TO authenticated 
  USING (is_staff());

-- 6. Ensure teachers can see/manage students they registered even if not in portal_users yet
DROP POLICY IF EXISTS "Staff manage students legacy" ON public.students;
CREATE POLICY "Staff manage students legacy" ON public.students
  FOR ALL 
  TO authenticated 
  USING (
    is_staff() 
    OR auth.uid() = created_by
  );
