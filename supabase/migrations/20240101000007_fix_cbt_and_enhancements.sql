-- ============================================================
-- Migration 007: Fix CBT session status and schema enhancements
-- ============================================================

-- Fix cbt_sessions status to support passed/failed outcomes
DO $$
BEGIN
  -- Drop old constraint if it exists
  ALTER TABLE public.cbt_sessions DROP CONSTRAINT IF EXISTS cbt_sessions_status_check;
  -- Add new constraint supporting passed/failed as well as legacy values
  ALTER TABLE public.cbt_sessions
    ADD CONSTRAINT cbt_sessions_status_check
    CHECK (status IN ('in_progress', 'completed', 'abandoned', 'passed', 'failed'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cbt_sessions status constraint update skipped: %', SQLERRM;
END $$;

-- Add answers column to cbt_sessions if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='cbt_sessions' AND column_name='answers'
  ) THEN
    ALTER TABLE public.cbt_sessions ADD COLUMN answers JSONB;
  END IF;
END $$;

-- Add score column to cbt_sessions if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='cbt_sessions' AND column_name='score'
  ) THEN
    ALTER TABLE public.cbt_sessions ADD COLUMN score INTEGER;
  END IF;
END $$;

-- Allow teachers to manage CBT exams (not just admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cbt_exams' AND policyname='Teachers can manage CBT exams'
  ) THEN
    CREATE POLICY "Teachers can manage CBT exams" ON public.cbt_exams
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Allow teachers to manage CBT questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cbt_questions' AND policyname='Teachers can manage CBT questions'
  ) THEN
    CREATE POLICY "Teachers can manage CBT questions" ON public.cbt_questions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Allow teachers to view all CBT sessions for exams they manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cbt_sessions' AND policyname='Staff can view all CBT sessions'
  ) THEN
    CREATE POLICY "Staff can view all CBT sessions" ON public.cbt_sessions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Ensure attendance RLS allows teachers to manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='attendance' AND policyname='Teachers can manage attendance'
  ) THEN
    CREATE POLICY "Teachers can manage attendance" ON public.attendance
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Ensure class_sessions RLS allows teachers to manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='class_sessions' AND policyname='Teachers can manage class sessions'
  ) THEN
    CREATE POLICY "Teachers can manage class sessions" ON public.class_sessions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Enable RLS on class_sessions if not enabled
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

-- Allow students to view their own class sessions (via class enrollment)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='class_sessions' AND policyname='Students can view class sessions'
  ) THEN
    CREATE POLICY "Students can view class sessions" ON public.class_sessions
      FOR SELECT
      USING (true); -- public view; attendance itself is access-controlled
  END IF;
END $$;

-- Students can view their own attendance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='attendance' AND policyname='Students can view own attendance'
  ) THEN
    CREATE POLICY "Students can view own attendance" ON public.attendance
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Messages policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='messages' AND policyname='Users can send messages'
  ) THEN
    CREATE POLICY "Users can send messages" ON public.messages
      FOR INSERT WITH CHECK (sender_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='messages' AND policyname='Users can view own messages'
  ) THEN
    CREATE POLICY "Users can view own messages" ON public.messages
      FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='messages' AND policyname='Recipients can update read status'
  ) THEN
    CREATE POLICY "Recipients can update read status" ON public.messages
      FOR UPDATE USING (recipient_id = auth.uid());
  END IF;
END $$;

-- Announcements policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='announcements' AND policyname='All users can view announcements'
  ) THEN
    CREATE POLICY "All users can view announcements" ON public.announcements
      FOR SELECT USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='announcements' AND policyname='Staff can manage announcements'
  ) THEN
    CREATE POLICY "Staff can manage announcements" ON public.announcements
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.portal_users
          WHERE id = auth.uid() AND role IN ('admin', 'teacher')
        )
      );
  END IF;
END $$;

-- Portal users can update their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='portal_users' AND policyname='Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.portal_users
      FOR UPDATE USING (id = auth.uid());
  END IF;
END $$;
