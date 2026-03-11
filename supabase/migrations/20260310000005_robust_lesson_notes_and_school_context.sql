-- Add lesson_notes and school context to lessons
ALTER TABLE lessons 
  ADD COLUMN IF NOT EXISTS lesson_notes TEXT,
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS school_name TEXT;

-- Backfill school context from course
UPDATE lessons l
SET school_id = c.school_id,
    school_name = c.school_name
FROM courses c
WHERE l.course_id = c.id
AND l.school_id IS NULL;

-- Ensure lesson_plans reflects importance of notes
ALTER TABLE lesson_plans
  ADD COLUMN IF NOT EXISTS summary_notes TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_lessons_school ON lessons(school_id);
