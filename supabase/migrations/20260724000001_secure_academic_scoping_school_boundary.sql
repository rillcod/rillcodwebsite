-- 1. Courses SELECT policies
DROP POLICY IF EXISTS "Public can view courses" ON public.courses;

-- public/anon preview policy (restricted to active, public courses)
CREATE POLICY "courses_select_public"
  ON public.courses
  FOR SELECT
  USING (
    auth.uid() IS NULL
    AND is_active = true
    AND school_id IS NULL
  );

-- staff & parents full SELECT
CREATE POLICY "courses_select_staff_parent"
  ON public.courses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school', 'parent')
    )
  );

-- students SELECT scoped by program and school boundary
CREATE POLICY "courses_select_student"
  ON public.courses
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.portal_users pu ON pu.id = e.user_id
      WHERE e.user_id = auth.uid()
        AND e.status = 'active'
        AND e.program_id = courses.program_id
        AND (
          courses.school_id IS NULL
          OR pu.school_id = courses.school_id
        )
    )
  );


-- 2. Lessons SELECT policy update
DROP POLICY IF EXISTS "lessons_select_scoped" ON public.lessons;

CREATE POLICY "lessons_select_scoped"
  ON public.lessons
  FOR SELECT
  USING (
    status = 'active'
    AND (
      (auth.uid() IS NULL AND lessons.school_id IS NULL) -- public / anon preview of public lessons
      OR EXISTS (
        SELECT 1 FROM public.portal_users pu
        WHERE pu.id = auth.uid()
          AND pu.role IN ('admin', 'teacher', 'school', 'parent')
      )
      OR EXISTS (
        SELECT 1
        FROM public.enrollments e
        JOIN public.courses c ON c.program_id = e.program_id
        JOIN public.portal_users pu ON pu.id = e.user_id
        WHERE e.user_id = auth.uid()
          AND e.status = 'active'
          AND c.id = lessons.course_id
          AND (
            c.school_id IS NULL
            OR pu.school_id = c.school_id
          )
          AND (
            lessons.school_id IS NULL
            OR pu.school_id = lessons.school_id
          )
      )
    )
  );


-- 3. Assignments SELECT policy update
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
    )
    OR (
      assignments.program_id IS NULL
      AND assignments.course_id IS NULL
      AND (assignments.metadata ->> 'visibility') = 'all'
    )
  );
