-- =============================================
-- FIX: Staff & School Permissions for Work (Submissions & CBT Sessions)
-- =============================================

-- 1. assignment_submissions policies
DROP POLICY IF EXISTS "Admins can manage submissions" ON public.assignment_submissions;
CREATE POLICY "Staff can manage submissions" ON public.assignment_submissions
  FOR ALL 
  TO authenticated 
  USING (is_staff())
  WITH CHECK (is_staff());

DROP POLICY IF EXISTS "Staff can manage submissions" ON public.assignment_submissions;
CREATE POLICY "Staff can manage submissions" ON public.assignment_submissions
  FOR ALL 
  TO authenticated 
  USING (is_staff())
  WITH CHECK (is_staff());

-- 2. cbt_exams & cbt_questions (already mostly public view, but ensure staff can manage)
DROP POLICY IF EXISTS "Admins can manage exams" ON public.cbt_exams;
CREATE POLICY "Staff can manage exams" ON public.cbt_exams
  FOR ALL 
  TO authenticated 
  USING (is_staff())
  WITH CHECK (is_staff());

DROP POLICY IF EXISTS "Admins can manage questions" ON public.cbt_questions;
CREATE POLICY "Staff can manage questions" ON public.cbt_questions
  FOR ALL 
  TO authenticated 
  USING (is_staff())
  WITH CHECK (is_staff());

-- 3. cbt_sessions
DROP POLICY IF EXISTS "Admins can manage CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Staff can manage CBT sessions" ON public.cbt_sessions
  FOR ALL 
  TO authenticated 
  USING (is_staff())
  WITH CHECK (is_staff());

DROP POLICY IF EXISTS "Admins can manage sessions" ON public.cbt_sessions;
CREATE POLICY "Staff can manage sessions" ON public.cbt_sessions
  FOR ALL 
  TO authenticated 
  USING (is_staff())
  WITH CHECK (is_staff());

-- 4. Ensure students can still view their own
-- (Already exists in 00000000... migration, but good to re-assert)
DROP POLICY IF EXISTS "Students can view their submissions" ON public.assignment_submissions;
CREATE POLICY "Students can view their submissions" ON public.assignment_submissions 
  FOR SELECT TO authenticated USING (portal_user_id = auth.uid() OR is_staff());

DROP POLICY IF EXISTS "Students can view their CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Students can view their CBT sessions" ON public.cbt_sessions 
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_staff());
