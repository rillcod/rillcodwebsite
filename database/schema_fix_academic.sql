-- ============================================================
-- RILLCOD ACADEMY - SCHEMA FIX MIGRATION
-- Run this in Supabase SQL Editor (Project: akaorqukdoawacvxsdij)
-- ============================================================

-- 1. Fix assignment_submissions - ensure portal_user_id exists and is consistent
--    (The student_performance_summary view references user_id but the app uses portal_user_id)
DO $$
BEGIN
  -- Add portal_user_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignment_submissions' AND column_name = 'portal_user_id'
  ) THEN
    ALTER TABLE public.assignment_submissions ADD COLUMN portal_user_id uuid REFERENCES public.portal_users(id) ON DELETE CASCADE;
  END IF;

  -- Add user_id column as alias (for backward-compat view) if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignment_submissions' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.assignment_submissions ADD COLUMN user_id uuid REFERENCES public.portal_users(id);
  END IF;
END $$;

-- Sync user_id from portal_user_id for any rows that have one but not the other
UPDATE public.assignment_submissions
SET user_id = portal_user_id
WHERE user_id IS NULL AND portal_user_id IS NOT NULL;

UPDATE public.assignment_submissions
SET portal_user_id = user_id
WHERE portal_user_id IS NULL AND user_id IS NOT NULL;

-- 2. Fix cbt_sessions - add updated_at if missing
ALTER TABLE public.cbt_sessions 
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 3. Fix cbt_questions - add updated_at if missing  
ALTER TABLE public.cbt_questions
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 4. Fix assignments - ensure school_id scoping works
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL;

-- 5. Ensure assignment_submissions has submitted_at
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone DEFAULT now();
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS graded_at timestamp with time zone;
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS graded_by uuid REFERENCES public.portal_users(id);
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS submission_text text;
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS file_url text;

-- 6. Ensure cbt_sessions user_id column exists
ALTER TABLE public.cbt_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.portal_users(id) ON DELETE CASCADE;

-- 7. Fix the student_performance_summary view to use portal_user_id
DROP VIEW IF EXISTS public.student_performance_summary;
CREATE OR REPLACE VIEW public.student_performance_summary AS
  SELECT 
    p.id AS student_id,
    p.full_name,
    p.school_id,
    COUNT(DISTINCT e.program_id) AS enrolled_programs,
    AVG(cs.score) AS avg_exam_score,
    AVG(asub.grade) AS avg_assignment_grade,
    COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.status = 'completed') AS lessons_completed
  FROM public.portal_users p
  LEFT JOIN public.enrollments e ON p.id = e.user_id
  LEFT JOIN public.cbt_sessions cs ON p.id = cs.user_id AND cs.status IN ('passed', 'failed', 'completed')
  LEFT JOIN public.assignment_submissions asub ON p.id = COALESCE(asub.portal_user_id, asub.user_id) AND asub.status = 'graded'
  LEFT JOIN public.lesson_progress lp ON p.id = lp.portal_user_id AND lp.status = 'completed'
  WHERE p.role = 'student'
  GROUP BY p.id, p.full_name, p.school_id;

ALTER VIEW public.student_performance_summary OWNER TO postgres;

-- 8. RLS Policies for assignment_submissions (fix if broken)
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view own submissions" ON public.assignment_submissions;
CREATE POLICY "Students can view own submissions" ON public.assignment_submissions
  FOR SELECT USING (
    auth.uid() = COALESCE(portal_user_id, user_id)
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher', 'school')
    )
  );

DROP POLICY IF EXISTS "Students can insert own submissions" ON public.assignment_submissions;
CREATE POLICY "Students can insert own submissions" ON public.assignment_submissions
  FOR INSERT WITH CHECK (
    auth.uid() = COALESCE(portal_user_id, user_id)
  );

DROP POLICY IF EXISTS "Teachers can grade submissions" ON public.assignment_submissions;
CREATE POLICY "Teachers can grade submissions" ON public.assignment_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher')
    )
  );

-- 9. RLS for assignments table
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All users can view active assignments" ON public.assignments;
CREATE POLICY "All users can view active assignments" ON public.assignments
  FOR SELECT USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher', 'school')
    )
  );

DROP POLICY IF EXISTS "Teachers can manage assignments" ON public.assignments;
CREATE POLICY "Teachers can manage assignments" ON public.assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher')
    )
  );

-- 10. RLS for cbt_exams
ALTER TABLE public.cbt_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All users can view active CBT exams" ON public.cbt_exams;
CREATE POLICY "All users can view active CBT exams" ON public.cbt_exams
  FOR SELECT USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher', 'school')
    )
  );

DROP POLICY IF EXISTS "Teachers can manage CBT exams" ON public.cbt_exams;
CREATE POLICY "Teachers can manage CBT exams" ON public.cbt_exams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher')
    )
  );

-- 11. RLS for cbt_questions
ALTER TABLE public.cbt_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage CBT questions" ON public.cbt_questions;
CREATE POLICY "Staff can manage CBT questions" ON public.cbt_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher')
    )
  );

DROP POLICY IF EXISTS "Students can view questions during session" ON public.cbt_questions;
CREATE POLICY "Students can view questions during session" ON public.cbt_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
    )
  );

-- 12. Ensure cbt_sessions RLS allows students to insert/update own sessions
ALTER TABLE public.cbt_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can manage own CBT sessions" ON public.cbt_sessions;
CREATE POLICY "Students can manage own CBT sessions" ON public.cbt_sessions
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role IN ('admin', 'teacher', 'school')
    )
  );

SELECT 'Migration complete: Schema fixes applied successfully.' AS result;
