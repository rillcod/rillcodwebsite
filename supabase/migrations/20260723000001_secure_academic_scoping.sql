-- ─────────────────────────────────────────────────────────────────────────────
-- Secure academic scoping (defense-in-depth RLS)
--
-- The server API (/api/assignments) already scopes assignments correctly because
-- it uses the service-role key. But RLS on `assignments` and `lessons` was wide
-- open for direct client queries:
--   • assignments: "Students can view assignments" USING (auth.role()='authenticated')
--                  → ANY logged-in user could read EVERY assignment.
--   • lessons:     "lessons_select_all" USING (true)  +  "Students can view active
--                  lessons" → ANY user could read EVERY lesson.
-- Any client-side `db.from('assignments'|'lessons')` query therefore leaked across
-- programmes. This migration replaces those blanket policies with programme-scoped
-- SELECT policies, WITHOUT touching the existing staff/admin/parent policies (which
-- are OR-ed in, so those roles keep their access).
--
-- Safe-by-construction:
--   • Other roles keep dedicated policies ("Admins/Staff/Teachers can manage
--     assignments", "parent_read_assignments", "Staff can manage lessons", …).
--   • The new student policies are additive SELECT policies.
--   • All 652 existing enrolments are status='active', so the status predicate
--     hides nobody.
--   • Public/anon catalogue previews of ACTIVE lessons are preserved.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ASSIGNMENTS ──────────────────────────────────────────────────────────────
-- Remove the blanket "any authenticated user" SELECT policy.
DROP POLICY IF EXISTS "Students can view assignments" ON public.assignments;

-- Programme-scoped student read. Mirrors src/lib/assignments/visibility.ts:
--   explicit program_id  →  must be one of the student's enrolled programmes;
--   legacy course-only   →  course must belong to an enrolled programme;
--   truly unscoped        →  only when explicitly platform-wide.
-- Staff/parent read continues through their own (untouched) policies.
CREATE POLICY "assignments_select_student_scoped"
  ON public.assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.user_id = auth.uid()
        AND e.status = 'active'
        AND (
          e.program_id = assignments.program_id
          OR EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = assignments.course_id
              AND c.program_id = e.program_id
          )
        )
    )
    OR (
      assignments.program_id IS NULL
      AND assignments.course_id IS NULL
      AND (assignments.metadata ->> 'visibility') = 'all'
    )
  );

-- ── LESSONS ──────────────────────────────────────────────────────────────────
-- Remove the two blanket SELECT policies.
DROP POLICY IF EXISTS "lessons_select_all" ON public.lessons;
DROP POLICY IF EXISTS "Students can view active lessons" ON public.lessons;

-- Scoped read that preserves every legitimate consumer:
--   • staff (admin/teacher/school) and parents: full read of active lessons;
--   • anonymous/public catalogue: active lessons (marketing/preview);
--   • enrolled students: active lessons only in courses under their programmes.
-- Staff still see drafts/non-active lessons via "Staff can manage lessons" (ALL).
CREATE POLICY "lessons_select_scoped"
  ON public.lessons
  FOR SELECT
  USING (
    status = 'active'
    AND (
      auth.uid() IS NULL                                   -- public / anon preview
      OR EXISTS (
        SELECT 1 FROM public.portal_users pu
        WHERE pu.id = auth.uid()
          AND pu.role IN ('admin', 'teacher', 'school', 'parent')
      )
      OR EXISTS (
        SELECT 1
        FROM public.enrollments e
        JOIN public.courses c ON c.program_id = e.program_id
        WHERE e.user_id = auth.uid()
          AND e.status = 'active'
          AND c.id = lessons.course_id
      )
    )
  );
