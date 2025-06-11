-- Database Setup Script for Rillcod Academy
-- Run this in your Supabase SQL Editor

-- 1. First, let's see what columns currently exist in the students table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'students' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. If the table doesn't exist or has wrong columns, create/update it
-- Drop the existing table if it has wrong structure (BE CAREFUL - this will delete all data!)
-- DROP TABLE IF EXISTS students;

-- 3. Create the students table with the correct schema
CREATE TABLE IF NOT EXISTS students (
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

-- 4. If you have an existing table with different column names, you can rename them:
-- Example: If you have 'name' instead of 'full_name'
-- ALTER TABLE students RENAME COLUMN name TO full_name;

-- Example: If you have 'school' instead of 'school_name'
-- ALTER TABLE students RENAME COLUMN school TO school_name;

-- Example: If you have 'email' instead of 'parent_email'
-- ALTER TABLE students RENAME COLUMN email TO parent_email;

-- Example: If you have 'phone' instead of 'parent_phone'
-- ALTER TABLE students RENAME COLUMN phone TO parent_phone;

-- 5. Add any missing columns
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS full_name TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS age INTEGER;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS grade TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS school_name TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS course_interest TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_schedule TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS hear_about_us TEXT;
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 6. Verify the final schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'students' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 7. Set up Row Level Security (RLS) if needed
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- 8. Create a policy to allow inserts (adjust as needed for your security requirements)
CREATE POLICY "Allow public inserts" ON students
    FOR INSERT WITH CHECK (true);

-- 9. Create a policy to allow reads (adjust as needed)
CREATE POLICY "Allow public reads" ON students
    FOR SELECT USING (true); 