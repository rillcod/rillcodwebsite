-- Fix 1: Prevent duplicate CBT submissions at the database level.
-- The API already checks for duplicates in code, but a race condition between
-- two simultaneous requests can bypass that check. This constraint is the
-- authoritative guard.
ALTER TABLE cbt_sessions
  ADD CONSTRAINT cbt_sessions_exam_user_unique UNIQUE (exam_id, user_id);

-- Fix 2: Index on lessons.metadata->>'lesson_plan_id' to support the new
-- /api/lessons?lesson_plan_id= filter added for lesson plan linking.
-- Without this, every filter call does a full table scan.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_metadata_lesson_plan_id
  ON lessons (( metadata->>'lesson_plan_id' ))
  WHERE metadata IS NOT NULL;
