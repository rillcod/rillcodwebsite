-- =============================================
-- FIX: Student Progress Reports Visibility for School Partners
-- =============================================

-- Broaden the selection policy for student_progress_reports so school managers can see reports 
-- for students in their school, even if the report record itself has a NULL school_id (fallback to student's school)
-- or matches by school_name.

-- 1. Redefine the school view policy
DROP POLICY IF EXISTS "Schools view own student reports" ON public.student_progress_reports;
CREATE POLICY "Schools view own student reports" ON public.student_progress_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.portal_users manager
      LEFT JOIN public.portal_users student ON student.id = student_progress_reports.student_id
      WHERE manager.id = auth.uid()
        AND manager.role = 'school'
        AND (
          -- Direct match on report's school_id
          student_progress_reports.school_id = manager.school_id
          -- Fallback match on report's school_name
          OR student_progress_reports.school_name = manager.school_name
          -- Robust fallback: student belongs to manager's school
          OR student.school_id = manager.school_id
          OR student.school_name = manager.school_name
        )
    )
  );

-- 2. Ensure teachers can also see reports for their assigned schools
DROP POLICY IF EXISTS "Teachers view school reports" ON public.student_progress_reports;
CREATE POLICY "Teachers view school reports" ON public.student_progress_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.portal_users teacher
      LEFT JOIN public.teacher_schools ts ON ts.teacher_id = teacher.id
      LEFT JOIN public.portal_users student ON student.id = student_progress_reports.student_id
      WHERE teacher.id = auth.uid()
        AND teacher.role = 'teacher'
        AND (
          student_progress_reports.school_id = ts.school_id
          OR student.school_id = ts.school_id
          OR student_progress_reports.teacher_id = teacher.id
        )
    )
  );

-- 3. Update the student view policy to use updated_at for consistency if needed, 
-- but the policy itself just checks ownership and publication.
DROP POLICY IF EXISTS "Students view own published reports" ON public.student_progress_reports;
CREATE POLICY "Students view own published reports" ON public.student_progress_reports
  FOR SELECT USING (
    student_id = auth.uid() AND is_published = true
  );
