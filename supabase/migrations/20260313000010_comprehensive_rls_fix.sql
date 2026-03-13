-- Comprehensive RLS fix to prevent recursion and ensure correct access for staff
-- This migration standardizes all policies to use SECURITY DEFINER helpers

BEGIN;

-- 1. Helper functions
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT school_id FROM portal_users WHERE id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_school_id() TO authenticated;

-- 2. Students Table
DROP POLICY IF EXISTS "staff_can_view_students" ON public.students;
DROP POLICY IF EXISTS "Admins can manage students" ON public.students;
DROP POLICY IF EXISTS "student_can_view_own_record" ON public.students;
DROP POLICY IF EXISTS "staff_view_students" ON public.students;
DROP POLICY IF EXISTS "admin_teacher_manage_students" ON public.students;
DROP POLICY IF EXISTS "school_view_own_students" ON public.students;
DROP POLICY IF EXISTS "student_view_self" ON public.students;

CREATE POLICY "select_students_staff" ON public.students FOR SELECT USING (is_staff());
CREATE POLICY "select_students_self" ON public.students FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "manage_students_admin_teacher" ON public.students FOR ALL USING (get_my_role() IN ('admin', 'teacher'));
CREATE POLICY "manage_students_school" ON public.students FOR ALL USING (school_id = get_my_school_id());

-- 3. Schools Table
DROP POLICY IF EXISTS "staff_can_view_schools" ON public.schools;
DROP POLICY IF EXISTS "Admins can manage schools" ON public.schools;

CREATE POLICY "select_schools_staff" ON public.schools FOR SELECT USING (is_staff());
CREATE POLICY "manage_schools_admin" ON public.schools FOR ALL USING (is_admin());
CREATE POLICY "update_school_self" ON public.schools FOR UPDATE USING (id = get_my_school_id());

-- 4. Classes Table
DROP POLICY IF EXISTS "Public can view classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;

CREATE POLICY "select_classes_staff" ON public.classes FOR SELECT USING (is_staff());
CREATE POLICY "manage_classes_admin" ON public.classes FOR ALL USING (is_admin());
CREATE POLICY "manage_classes_teacher" ON public.classes FOR ALL USING (teacher_id = auth.uid());

-- 5. Assignments Table
DROP POLICY IF EXISTS "Public can view assignments" ON public.assignments;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.assignments;

CREATE POLICY "select_assignments_all" ON public.assignments FOR SELECT USING (true);
CREATE POLICY "manage_assignments_staff" ON public.assignments FOR ALL USING (is_staff());

-- 6. Assignment Submissions
DROP POLICY IF EXISTS "Students can view their submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students can submit assignments" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Admins can manage submissions" ON public.assignment_submissions;

CREATE POLICY "select_submissions_staff" ON public.assignment_submissions FOR SELECT USING (is_staff());
CREATE POLICY "select_submissions_self" ON public.assignment_submissions FOR SELECT USING (user_id = auth.uid() OR portal_user_id = auth.uid());
CREATE POLICY "insert_submissions_student" ON public.assignment_submissions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "update_submissions_staff" ON public.assignment_submissions FOR UPDATE USING (is_staff());

-- 7. Courses Table
DROP POLICY IF EXISTS "Public can view courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;

CREATE POLICY "select_courses_all" ON public.courses FOR SELECT USING (true);
CREATE POLICY "manage_courses_staff" ON public.courses FOR ALL USING (is_staff());

-- 8. Attendance
DROP POLICY IF EXISTS "Students can view their attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins can manage attendance" ON public.attendance;

CREATE POLICY "select_attendance_staff" ON public.attendance FOR SELECT USING (is_staff());
CREATE POLICY "select_attendance_self" ON public.attendance FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "manage_attendance_staff" ON public.attendance FOR ALL USING (is_staff());

-- 9. Teacher Schools (Deployment)
DROP POLICY IF EXISTS "Admins can manage deployment" ON public.teacher_schools;
CREATE POLICY "select_deployment_staff" ON public.teacher_schools FOR SELECT USING (is_staff());
CREATE POLICY "manage_deployment_admin" ON public.teacher_schools FOR ALL USING (is_admin());

-- 10. Notifications
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;

CREATE POLICY "select_notifications_self" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "update_notifications_self" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "manage_notifications_admin" ON public.notifications FOR ALL USING (is_admin());

-- 11. Messages
DROP POLICY IF EXISTS "Users can view their messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can manage messages" ON public.messages;

CREATE POLICY "select_messages_self" ON public.messages FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());
CREATE POLICY "insert_messages_self" ON public.messages FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "manage_messages_admin" ON public.messages FOR ALL USING (is_admin());

COMMIT;
