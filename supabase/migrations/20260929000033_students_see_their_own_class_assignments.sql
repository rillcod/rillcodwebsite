-- If you sit in the class, you can see the class's work.
--
-- assignments_select_student_scoped gates visibility on PROGRAMME: a learner
-- must hold an active enrolment whose program_id matches the assignment, or
-- whose programme owns the assignment's course. Class membership is only ever
-- used to NARROW that — never to grant.
--
-- That breaks the moment a learner's class and programme differ, which is a
-- supported situation, not an edge case: a student may be enrolled in a regular
-- programme and additionally placed in a special-programme cohort. Three
-- learners sitting in the AI Summer School cohort — with nine assignments in
-- their class — could see zero of them, because their active enrolment is
-- Young Innovators. They were in the room and the work was invisible.
--
-- Adding class membership as its own grant. It cannot over-expose: the
-- assignment names a class, and the learner is in that class. Nothing that was
-- previously visible becomes hidden — this only adds a way to qualify.
--
-- lessons and flashcard_decks scope by school rather than programme, so they
-- never had this gap and are untouched.

drop policy if exists assignments_select_student_scoped on public.assignments;

create policy assignments_select_student_scoped on public.assignments for select using (
  -- 1. Programme route (unchanged).
  (EXISTS (
    SELECT 1
    FROM enrollments e
    JOIN portal_users pu ON pu.id = e.user_id
    WHERE e.user_id = auth.uid()
      AND e.status = 'active'
      AND (
        e.program_id = assignments.program_id
        OR EXISTS (
          SELECT 1 FROM courses c
          WHERE c.id = assignments.course_id
            AND c.program_id = e.program_id
            AND (c.school_id IS NULL OR pu.school_id = c.school_id)
        )
      )
      AND (assignments.school_id IS NULL OR pu.school_id = assignments.school_id)
      AND (assignments.class_id IS NULL OR pu.class_id = assignments.class_id)
  ))

  -- 2. Class route: the learner is in the very class this assignment is set for.
  OR (
    assignments.class_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role = 'student'
        AND pu.class_id = assignments.class_id
    )
  )

  -- 3. Open assignments (unchanged).
  OR (
    assignments.program_id IS NULL
    AND assignments.course_id IS NULL
    AND (assignments.metadata ->> 'visibility') = 'all'
  )
);

comment on policy assignments_select_student_scoped on public.assignments is
  'A learner sees an assignment when their enrolled programme owns it, OR they are in the class it was set for, OR it is marked visibility=all. The class route exists because a learner may sit in a cohort outside their enrolled programme.';
