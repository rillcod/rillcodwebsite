-- Fix course_curricula RLS: migration 53 dropped 'school' role from all policies,
-- causing RLS violations for school-role users who access the curriculum page.
-- Also fix: teachers without school_id couldn't insert global (null school_id) rows.

-- Drop all current policies
DROP POLICY IF EXISTS "select_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "insert_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "update_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "delete_curricula" ON public.course_curricula;

-- SELECT: admin sees all; teacher/school see their school's rows OR global (null school_id)
CREATE POLICY "select_curricula"
  ON public.course_curricula
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school')
        AND (
          pu.role = 'admin'
          OR course_curricula.school_id IS NULL
          OR pu.school_id = course_curricula.school_id
        )
    )
  );

-- INSERT: admin can insert any row; teacher/school can insert for their own school only
-- Teachers with no school_id can insert global rows (school_id = NULL)
CREATE POLICY "insert_curricula"
  ON public.course_curricula
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school')
        AND (
          pu.role = 'admin'
          OR course_curricula.school_id IS NULL        -- global row: teacher with no school
          OR pu.school_id = course_curricula.school_id -- school-scoped row
        )
    )
  );

-- UPDATE: same logic as INSERT
CREATE POLICY "update_curricula"
  ON public.course_curricula
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school')
        AND (
          pu.role = 'admin'
          OR course_curricula.school_id IS NULL
          OR pu.school_id = course_curricula.school_id
        )
    )
  );

-- DELETE: admin only
CREATE POLICY "delete_curricula"
  ON public.course_curricula
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'admin'
    )
  );
