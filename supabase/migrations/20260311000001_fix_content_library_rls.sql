-- =============================================
-- FIX: Content Library RLS Permissions
-- =============================================

-- Enable RLS (already enabled but just in case)
ALTER TABLE public.content_library ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Instructors can view content library" ON public.content_library;
DROP POLICY IF EXISTS "Staff can manage content library" ON public.content_library;
DROP POLICY IF EXISTS "Users can view content" ON public.content_library;

-- 1. SELECT: Users can view content if it's approved, if they are staff, or if they created it
CREATE POLICY "Users can view content" ON public.content_library
  FOR SELECT
  TO authenticated
  USING (
    is_approved = true 
    OR is_staff() 
    OR auth.uid() = created_by
  );

-- 2. ALL: Staff can manage all content
CREATE POLICY "Staff can manage content library" ON public.content_library
  FOR ALL
  TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- 3. INSERT: Any authenticated user can contribute content (requires approval if not admin)
CREATE POLICY "Users can insert content" ON public.content_library
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR is_staff());

-- =============================================
-- Live Sessions & Ratings
-- =============================================

-- Content Ratings: Allow users to manage their own ratings, staff to view all
DROP POLICY IF EXISTS "Users can manage own ratings" ON public.content_ratings;
CREATE POLICY "Users can manage own ratings" ON public.content_ratings
  FOR ALL
  TO authenticated
  USING (portal_user_id = auth.uid() OR is_staff())
  WITH CHECK (portal_user_id = auth.uid());

-- Live Sessions: Allow staff to manage, students to view
DROP POLICY IF EXISTS "Staff can manage live sessions" ON public.live_sessions;
CREATE POLICY "Staff can manage live sessions" ON public.live_sessions
  FOR ALL
  TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- Ensure enrolled students can still view (legacy policy might be too specific or broken)
DROP POLICY IF EXISTS "Enrolled students can view live sessions" ON public.live_sessions;
CREATE POLICY "Enrolled students can view live sessions" ON public.live_sessions
  FOR SELECT
  TO authenticated
  USING (is_staff() OR EXISTS (
    SELECT 1 FROM enrollments e
    JOIN courses c ON c.program_id = e.program_id
    WHERE e.user_id = auth.uid() AND c.id = live_sessions.course_id
  ));

-- Ensure updated_at trigger exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_content_library_updated_at') THEN
        CREATE TRIGGER update_content_library_updated_at
        BEFORE UPDATE ON public.content_library
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
