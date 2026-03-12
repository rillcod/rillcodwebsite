-- =============================================
-- FIX: Ensure staff can write grades to assignment_submissions and cbt_sessions
-- Replaces all conflicting policies with clean is_staff() based rules
-- =============================================

-- ── assignment_submissions ─────────────────────────────────────

-- Drop ALL existing policies on this table to avoid conflicts
DROP POLICY IF EXISTS "Students can view their submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students can submit assignments" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Admins can manage submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Staff can manage submissions" ON public.assignment_submissions;

-- Staff: full access (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Staff can manage submissions" ON public.assignment_submissions;
CREATE POLICY "Staff can manage submissions" ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- Students: can see their own submissions (by portal_user_id OR legacy user_id)
DROP POLICY IF EXISTS "Students view own submissions" ON public.assignment_submissions;
CREATE POLICY "Students view own submissions" ON public.assignment_submissions
  FOR SELECT TO authenticated
  USING (
    portal_user_id = auth.uid()
    OR user_id = auth.uid()
    OR is_staff()
  );

-- Students: can insert their own submissions
DROP POLICY IF EXISTS "Students insert own submissions" ON public.assignment_submissions;
CREATE POLICY "Students insert own submissions" ON public.assignment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    portal_user_id = auth.uid()
    OR user_id = auth.uid()
  );

-- Students: can update their own submissions (resubmission)
DROP POLICY IF EXISTS "Students update own submissions" ON public.assignment_submissions;
CREATE POLICY "Students update own submissions" ON public.assignment_submissions
  FOR UPDATE TO authenticated
  USING (
    portal_user_id = auth.uid()
    OR user_id = auth.uid()
  );

-- ── cbt_sessions ───────────────────────────────────────────────

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Students can view their CBT sessions" ON public.cbt_sessions;
DROP POLICY IF EXISTS "Students can take CBT" ON public.cbt_sessions;
DROP POLICY IF EXISTS "Admins can manage CBT sessions" ON public.cbt_sessions;
DROP POLICY IF EXISTS "Staff can manage CBT sessions" ON public.cbt_sessions;
DROP POLICY IF EXISTS "Staff can manage sessions" ON public.cbt_sessions;
DROP POLICY IF EXISTS "Students can view their submissions" ON public.cbt_sessions;

-- Staff: full access
DROP POLICY IF EXISTS "Staff can manage CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Staff can manage CBT sessions" ON public.cbt_sessions
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- Students: can view their own sessions
DROP POLICY IF EXISTS "Students view own CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Students view own CBT sessions" ON public.cbt_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_staff());

-- Students: can create (start) their own session
DROP POLICY IF EXISTS "Students start CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Students start CBT sessions" ON public.cbt_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Students: can update their own session (save progress / submit)
DROP POLICY IF EXISTS "Students update own CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Students update own CBT sessions" ON public.cbt_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_staff());

-- Grant to be safe
GRANT ALL ON public.assignment_submissions TO authenticated, service_role;
GRANT ALL ON public.cbt_sessions TO authenticated, service_role;
