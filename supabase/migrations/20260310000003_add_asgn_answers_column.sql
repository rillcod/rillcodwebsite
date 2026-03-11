-- Add answers column to assignment_submissions to support quiz-style assignments
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS answers JSONB;
