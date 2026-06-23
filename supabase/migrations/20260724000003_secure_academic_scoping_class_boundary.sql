-- Drop and recreate the student assignments SELECT policy to enforce class_id boundary
DROP POLICY IF EXISTS "assignments_select_student_scoped" ON public.assignments;

CREATE POLICY "assignments_select_student_scoped"
  ON public.assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.portal_users pu ON pu.id = e.user_id
      WHERE e.user_id = auth.uid()
        AND e.status = 'active'
        AND (
          e.program_id = assignments.program_id
          OR EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = assignments.course_id
              AND c.program_id = e.program_id
              AND (
                c.school_id IS NULL
                OR pu.school_id = c.school_id
              )
          )
        )
        AND (
          assignments.school_id IS NULL
          OR pu.school_id = assignments.school_id
        )
        AND (
          assignments.class_id IS NULL
          OR pu.class_id = assignments.class_id
        )
    )
    OR (
      assignments.program_id IS NULL
      AND assignments.course_id IS NULL
      AND (assignments.metadata ->> 'visibility') = 'all'
    )
  );
