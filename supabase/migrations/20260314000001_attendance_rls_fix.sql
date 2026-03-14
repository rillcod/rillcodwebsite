-- Comprehensive RLS for attendance and sessions
-- Ensures staff can manage their own records without recursion.

BEGIN;

-- 0. Ensure Helper Functions Exist
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
BEGIN
  RETURN (SELECT school_id FROM public.portal_users WHERE id = auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
BEGIN
  RETURN (SELECT role = 'admin' FROM public.portal_users WHERE id = auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $$
BEGIN
  RETURN (SELECT role IN ('admin', 'teacher', 'school') FROM public.portal_users WHERE id = auth.uid());
END; $$;

-- 1. Class Sessions
DROP POLICY IF EXISTS "Public can view sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "Admins can manage sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "Teachers can manage sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "Teachers can manage class sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "Students can view class sessions" ON public.class_sessions;

CREATE POLICY "select_sessions_all" ON public.class_sessions FOR SELECT USING (true);
CREATE POLICY "manage_sessions_staff_and_admin" ON public.class_sessions 
FOR ALL USING (
  public.is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.classes c 
    WHERE c.id = class_sessions.class_id 
    AND (c.teacher_id = auth.uid() OR c.school_id = public.get_my_school_id())
  )
);

-- 2. Attendance
DROP POLICY IF EXISTS "select_attendance_staff" ON public.attendance;
DROP POLICY IF EXISTS "select_attendance_self" ON public.attendance;
DROP POLICY IF EXISTS "manage_attendance_staff" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can record attendance" ON public.attendance;
DROP POLICY IF EXISTS "Students can view their attendance" ON public.attendance;

CREATE POLICY "select_attendance_all" ON public.attendance FOR SELECT USING (
  public.is_staff() OR user_id = auth.uid()
);

CREATE POLICY "manage_attendance_staff_and_admin" ON public.attendance 
FOR ALL USING (
  public.is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.class_sessions s
    JOIN public.classes c ON c.id = s.class_id
    WHERE s.id = attendance.session_id
    AND (c.teacher_id = auth.uid() OR c.school_id = public.get_my_school_id())
  )
);

-- 3. Portal Users Update (Allow Teachers to assign students to classes)
DROP POLICY IF EXISTS "portal_users_teacher_update_class" ON public.portal_users;
CREATE POLICY "portal_users_staff_update_limited" ON public.portal_users
FOR UPDATE USING (
  public.is_admin() OR
  (public.is_staff() AND (school_id = public.get_my_school_id()))
)
WITH CHECK (
  public.is_admin() OR
  (public.is_staff() AND (school_id = public.get_my_school_id()))
);

COMMIT;
