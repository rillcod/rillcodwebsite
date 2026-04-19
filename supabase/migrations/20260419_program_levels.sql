-- ============================================================
-- Program Levels & Student Progression Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Programs: delivery type (compulsory = sequential graded;
--              optional = project-based, open-enrollment)
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'compulsory'
    CHECK (delivery_type IN ('compulsory', 'optional'));

-- 2. Courses: level sequencing
--    level_order  → position in the track (1, 2, 3 …)
--    next_course_id → FK to the next level course
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS level_order INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_course_id UUID REFERENCES courses(id) ON DELETE SET NULL;

-- Index for fast "what comes next" lookups
CREATE INDEX IF NOT EXISTS idx_courses_next ON courses(next_course_id);

-- 3. Student Level Enrollments
--    Tracks exactly where every student is in the progressive track.
--    One row per student per course-level per term attempt.
CREATE TABLE IF NOT EXISTS student_level_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  school_id       UUID REFERENCES schools(id) ON DELETE SET NULL,
  program_id      UUID REFERENCES programs(id) ON DELETE SET NULL,

  -- Which school-year intake this student belongs to
  cohort_year     INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INT,

  -- Term label matches the school calendar (e.g. 'Term 1 2024')
  term_label      TEXT NOT NULL,

  -- For mid-term joiners: week they started (1 = from the beginning)
  start_week      INT NOT NULL DEFAULT 1,

  -- Lifecycle: active → promoted | repeated | completed | withdrawn
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'promoted', 'repeated', 'completed', 'withdrawn')),

  -- Set when teacher promotes; points to the next course (level)
  promoted_to     UUID REFERENCES courses(id) ON DELETE SET NULL,

  -- Optional flag for optional-track module choice
  module_name     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active enrollment for same student + course + term
CREATE UNIQUE INDEX IF NOT EXISTS idx_sle_unique_active
  ON student_level_enrollments(student_id, course_id, term_label)
  WHERE status = 'active';

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_sle_student   ON student_level_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_sle_course    ON student_level_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_sle_school    ON student_level_enrollments(school_id);
CREATE INDEX IF NOT EXISTS idx_sle_status    ON student_level_enrollments(status);

-- RLS
ALTER TABLE student_level_enrollments ENABLE ROW LEVEL SECURITY;

-- Staff (admin/teacher) can read all; school role can read their own school
CREATE POLICY sle_staff_read ON student_level_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'teacher')
    )
  );

CREATE POLICY sle_school_read ON student_level_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM portal_users u
      WHERE u.id = auth.uid()
        AND u.role = 'school'
        AND u.school_id = student_level_enrollments.school_id
    )
  );

CREATE POLICY sle_student_read ON student_level_enrollments
  FOR SELECT USING (student_id = auth.uid());

-- Only admin/teacher can insert/update
CREATE POLICY sle_staff_write ON student_level_enrollments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM portal_users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'teacher')
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS sle_updated_at ON student_level_enrollments;
CREATE TRIGGER sle_updated_at
  BEFORE UPDATE ON student_level_enrollments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
