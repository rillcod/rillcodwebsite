-- Course locking: teacher can lock a course so students cannot see or access it
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN courses.is_locked IS
  'When true, the course is hidden from students. Teachers/admins can still see it. '
  'Use this to control which courses students can focus on at any given time.';
