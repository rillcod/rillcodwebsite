-- Fix students table RLS policies that query portal_users directly,
-- causing infinite recursion. Replace with get_my_role() SECURITY DEFINER calls.

-- Drop all conflicting SELECT policies on students
drop policy if exists "Public can view students" on students;
drop policy if exists "Teachers can view all students" on students;
drop policy if exists "Staff can view students" on students;
drop policy if exists "Teachers can view their own registered students" on students;

-- Single clean SELECT policy: admin/teacher/school can read all students
create policy "staff_can_view_students"
  on students for select
  using (
    get_my_role() in ('admin', 'teacher', 'school')
  );

-- Students can view their own record (via linked user_id)
create policy "student_can_view_own_record"
  on students for select
  using (
    user_id = auth.uid()
  );
