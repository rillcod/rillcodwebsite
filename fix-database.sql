-- Fix Database Schema for Rillcod Academy
-- Run this in your Supabase SQL Editor

-- 1. First, let's see what currently exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'students';

-- 2. If the students table exists, let's see its current structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'students' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Drop the existing table if it has wrong structure
-- WARNING: This will delete all existing data!
DROP TABLE IF EXISTS students;

-- 4. Create the students table with the correct schema
CREATE TABLE students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    age INTEGER,
    grade TEXT,
    school_name TEXT,
    gender TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    course_interest TEXT,
    preferred_schedule TEXT,
    hear_about_us TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable Row Level Security
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- 6. Create policies to allow public access
CREATE POLICY "Allow public inserts" ON students
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public reads" ON students
    FOR SELECT USING (true);

-- 7. Verify the table was created correctly
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'students' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 8. Test insert
INSERT INTO students (full_name, age, school_name, parent_email) 
VALUES ('Test Student', 12, 'Test School', 'test@example.com');

-- 9. Verify the test data
SELECT * FROM students; 