-- Simple Database Setup for Rillcod Academy
-- Run this in your Supabase SQL Editor

-- 1. Drop existing table if it has issues
DROP TABLE IF EXISTS students;

-- 2. Create a simple students table with only essential columns
CREATE TABLE students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER,
    email TEXT,
    phone TEXT,
    school TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row Level Security
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- 4. Create policies to allow public access
CREATE POLICY "Allow public inserts" ON students
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public reads" ON students
    FOR SELECT USING (true);

-- 5. Test the table
INSERT INTO students (name, age, email, phone, school) 
VALUES ('Test Student', 12, 'test@example.com', '1234567890', 'Test School');

-- 6. Verify it works
SELECT * FROM students; 