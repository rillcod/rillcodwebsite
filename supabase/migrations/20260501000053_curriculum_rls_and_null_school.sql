-- Relax school_id constraint and update RLS policies for course_curricula
-- Applied: 2026-04-19

-- 1. Relax NOT NULL constraint on school_id
ALTER TABLE public.course_curricula ALTER COLUMN school_id DROP NOT NULL;

-- 2. Drop old policies
DROP POLICY IF EXISTS "staff select curricula for their school" ON public.course_curricula;
DROP POLICY IF EXISTS "staff insert curricula for their school" ON public.course_curricula;
DROP POLICY IF EXISTS "staff update curricula for their school" ON public.course_curricula;
DROP POLICY IF EXISTS "school admins delete curricula for their school" ON public.course_curricula;
DROP POLICY IF EXISTS "select_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "insert_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "update_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "delete_curricula" ON public.course_curricula;
DROP POLICY IF EXISTS "admins delete curricula for their school" ON public.course_curricula;

-- 3. Create new restricted policies (Admin & Teacher only)

-- SELECT: Admin all, Teacher own school or global (null school_id)
CREATE POLICY "select_curricula"
  ON public.course_curricula
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher')
        AND (
          pu.role = 'admin' 
          OR course_curricula.school_id IS NULL 
          OR pu.school_id = course_curricula.school_id
        )
    )
  );

-- INSERT: Admin all, Teacher own school only
CREATE POLICY "insert_curricula"
  ON public.course_curricula
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher')
        AND (
          pu.role = 'admin' 
          OR (pu.school_id IS NOT NULL AND pu.school_id = course_curricula.school_id)
        )
    )
  );

-- UPDATE: Admin all, Teacher own school only
CREATE POLICY "update_curricula"
  ON public.course_curricula
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher')
        AND (
          pu.role = 'admin' 
          OR (pu.school_id IS NOT NULL AND pu.school_id = course_curricula.school_id)
        )
    )
  );

-- DELETE: Admin only
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
