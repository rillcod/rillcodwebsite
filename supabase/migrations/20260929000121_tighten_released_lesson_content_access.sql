-- Keep learner-facing lessons and materials behind one release + audience gate.
-- Staff retain their existing review/manage policies, including draft preview.

CREATE OR REPLACE FUNCTION public.can_read_released_lesson(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = p_lesson_id
      AND l.status = 'active'
      AND (
        -- Only classless, school-independent catalogue lessons are anonymous.
        (auth.uid() IS NULL AND l.school_id IS NULL AND l.class_id IS NULL)
        OR EXISTS (
          SELECT 1
          FROM public.portal_users viewer
          WHERE viewer.id = auth.uid()
            AND (
              (
                viewer.role = 'student'
                AND (l.school_id IS NULL OR viewer.school_id = l.school_id)
                AND (
                  -- A classroom package belongs to that exact class.
                  (l.class_id IS NOT NULL AND viewer.class_id = l.class_id)
                  OR (
                    -- Classless content follows the learner's active programme.
                    l.class_id IS NULL
                    AND EXISTS (
                      SELECT 1
                      FROM public.enrollments e
                      JOIN public.courses c ON c.program_id = e.program_id
                      WHERE e.user_id = viewer.id
                        AND e.status IN ('active', 'enrolled', 'approved')
                        AND c.id = l.course_id
                        AND (c.school_id IS NULL OR viewer.school_id = c.school_id)
                    )
                  )
                )
              )
              OR (
                -- Parents inherit only a linked child's legitimate access.
                viewer.role = 'parent'
                AND EXISTS (
                  SELECT 1
                  FROM public.portal_users child
                  WHERE child.id IN (SELECT public.get_parent_child_user_ids())
                    AND child.role = 'student'
                    AND (l.school_id IS NULL OR child.school_id = l.school_id)
                    AND (
                      (l.class_id IS NOT NULL AND child.class_id = l.class_id)
                      OR (
                        l.class_id IS NULL
                        AND EXISTS (
                          SELECT 1
                          FROM public.enrollments e
                          JOIN public.courses c ON c.program_id = e.program_id
                          WHERE e.user_id = child.id
                            AND e.status IN ('active', 'enrolled', 'approved')
                            AND c.id = l.course_id
                            AND (c.school_id IS NULL OR child.school_id = c.school_id)
                        )
                      )
                    )
                )
              )
            )
        )
      )
  );
$function$;

ALTER FUNCTION public.can_read_released_lesson(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_read_released_lesson(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_released_lesson(uuid) TO anon, authenticated, service_role;

-- Existing generated class packages follow their lesson's current release state.
-- Stand-alone materials are deliberately left untouched.
UPDATE public.lesson_materials lm
SET is_public = (l.status = 'active')
FROM public.lessons l
WHERE l.id = lm.lesson_id
  AND lm.lesson_plan_id IS NOT NULL
  AND lm.is_public IS DISTINCT FROM (l.status = 'active');

DROP POLICY IF EXISTS "lessons_select_scoped" ON public.lessons;
CREATE POLICY "lessons_select_scoped"
ON public.lessons
FOR SELECT
TO anon, authenticated
USING (public.can_read_released_lesson(id));

DROP POLICY IF EXISTS "read_public_materials" ON public.lesson_materials;
CREATE POLICY "read_public_materials"
ON public.lesson_materials
FOR SELECT
TO anon, authenticated
USING (
  COALESCE(public.is_staff(), false)
  OR (
    is_public = true
    AND lesson_id IS NOT NULL
    AND public.can_read_released_lesson(lesson_id)
  )
);

COMMENT ON FUNCTION public.can_read_released_lesson(uuid) IS
  'Canonical learner/parent audience gate for an active lesson; class packages require exact class membership.';
