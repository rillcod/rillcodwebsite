-- Add Missing Columns to Existing Students Table
-- Run this in your Supabase SQL Editor if you don't want to drop your existing table

-- Add missing columns one by one (these will be ignored if they already exist)
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS course_interest TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_schedule TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS hear_about_us TEXT;

-- Verify all columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'students' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Test insert with all fields
INSERT INTO students (
    name, 
    age, 
    email, 
    phone, 
    school, 
    grade, 
    gender, 
    parent_name, 
    course_interest, 
    preferred_schedule, 
    hear_about_us
) VALUES (
    'Complete Test Student', 
    13, 
    'complete@example.com', 
    '0987654321', 
    'Complete School', 
    'JSS 1-3', 
    'Female', 
    'Complete Parent', 
    'Web Development', 
    'Weekday Afternoons', 
    'Social Media'
);

-- Verify the test data
SELECT * FROM students WHERE name = 'Complete Test Student'; 