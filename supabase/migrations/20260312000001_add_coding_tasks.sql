-- Add 'coding' to assignment types and 'coding_blocks' to question types
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_assignment_type_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_assignment_type_check 
  CHECK (assignment_type IN ('homework', 'project', 'quiz', 'exam', 'presentation', 'coding'));

ALTER TABLE cbt_questions DROP CONSTRAINT IF EXISTS cbt_questions_question_type_check;
ALTER TABLE cbt_questions ADD CONSTRAINT cbt_questions_question_type_check 
  CHECK (question_type IN ('multiple_choice', 'true_false', 'essay', 'fill_blank', 'coding_blocks'));

-- Add a column to store block configurations (available blocks, starter state, etc.)
ALTER TABLE cbt_questions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
