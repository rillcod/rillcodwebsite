-- Allow teachers assigned to a school via teacher_schools to read/write
-- course_curricula for that school (one syllabus per course per school).
-- Before this, only portal_users.school_id matched RLS, so multi-school
-- teachers could not author School B’s curriculum if their profile was School A.

DROP POLICY IF EXISTS "select_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "insert_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "update_curricula" ON public.course_curricula;

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
          OR EXISTS (
              SELECT 1
              FROM public.teacher_schools ts
              WHERE ts.teacher_id = auth.uid()
                AND ts.school_id = course_curricula.school_id
            )
        )
    )
  );

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
          OR course_curricula.school_id IS NULL
          OR pu.school_id = course_curricula.school_id
          OR EXISTS (
              SELECT 1
              FROM public.teacher_schools ts
              WHERE ts.teacher_id = auth.uid()
                AND ts.school_id = course_curricula.school_id
            )
        )
    )
  );

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
          OR EXISTS (
              SELECT 1
              FROM public.teacher_schools ts
              WHERE ts.teacher_id = auth.uid()
                AND ts.school_id = course_curricula.school_id
            )
        )
    )
  );

-- DELETE policy unchanged (admin only) — see 20260501000054
