-- Complete Database Setup for Rillcod Academy
-- Run this in your Supabase SQL Editor

-- 1. Drop existing table if it has issues
DROP TABLE IF EXISTS students;

-- 2. Create a complete students table with all important fields
CREATE TABLE students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER,
    email TEXT,
    phone TEXT,
    school TEXT,
    grade TEXT,
    gender TEXT,
    parent_name TEXT,
    course_interest TEXT,
    preferred_schedule TEXT,
    hear_about_us TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row Level Security
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- 4. Create policies to allow public access
CREATE POLICY "Allow public inserts" ON students
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public reads" ON students
    FOR SELECT USING (true);

-- 5. Test the table with complete data
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
    'Test Student', 
    12, 
    'test@example.com', 
    '1234567890', 
    'Test School', 
    'Primary 4-6', 
    'Male', 
    'Test Parent', 
    'Python Programming', 
    'Weekend Mornings', 
    'Friend'
);

-- 6. Verify it works
SELECT * FROM students; 