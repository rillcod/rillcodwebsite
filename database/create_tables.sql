-- Create the 3 basic tables for Rillcod Academy
-- Run this first to create the missing tables

-- ========================================
-- CREATE PORTAL_USERS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS portal_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- CREATE SCHOOLS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS schools (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- CREATE STUDENTS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    parent_email VARCHAR(255),
    parent_phone VARCHAR(50),
    school_name VARCHAR(255),
    grade_level VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- CREATE INDEXES
-- ========================================

-- Indexes for portal_users
CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email);
CREATE INDEX IF NOT EXISTS idx_portal_users_role ON portal_users(role);
CREATE INDEX IF NOT EXISTS idx_portal_users_active ON portal_users(is_active);

-- Indexes for schools
CREATE INDEX IF NOT EXISTS idx_schools_name ON schools(name);
CREATE INDEX IF NOT EXISTS idx_schools_active ON schools(is_active);

-- Indexes for students
CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_name);

-- ========================================
-- ENABLE ROW LEVEL SECURITY
-- ========================================

ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- ========================================
-- CREATE SIMPLE POLICIES
-- ========================================

-- Policies for portal_users
CREATE POLICY "portal_users_allow_all"
ON portal_users
FOR ALL
USING (true)
WITH CHECK (true);

-- Policies for schools
CREATE POLICY "schools_allow_all"
ON schools
FOR ALL
USING (true)
WITH CHECK (true);

-- Policies for students
CREATE POLICY "students_allow_all"
ON students
FOR ALL
USING (true)
WITH CHECK (true);

-- ========================================
-- CREATE ADMIN USER
-- ========================================

INSERT INTO portal_users (
    email,
    password_hash,
    full_name,
    role,
    is_active
) VALUES (
    'admin@rillcod.com',
    'YWRtaW4xMjM=', -- 'admin123' in base64
    'System Administrator',
    'admin',
    true
) ON CONFLICT (email) DO NOTHING;

-- ========================================
-- GRANT PERMISSIONS
-- ========================================

-- Grant permissions to authenticated users
GRANT ALL ON portal_users TO authenticated;
GRANT ALL ON schools TO authenticated;
GRANT ALL ON students TO authenticated;

-- Grant permissions to anonymous users (for registration)
GRANT ALL ON portal_users TO anon;
GRANT ALL ON schools TO anon;
GRANT ALL ON students TO anon;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- ========================================
-- VERIFY CREATION
-- ========================================

-- Check tables exist
SELECT 
    tablename,
    tableowner,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('portal_users', 'schools', 'students')
ORDER BY tablename;

-- Check policies
SELECT 
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename IN ('portal_users', 'schools', 'students')
ORDER BY tablename, policyname;

-- Check admin user
SELECT 
    id,
    email,
    full_name,
    role,
    is_active,
    created_at
FROM portal_users 
WHERE role = 'admin';

-- Test basic queries
SELECT COUNT(*) as portal_users_count FROM portal_users;
SELECT COUNT(*) as schools_count FROM schools;
SELECT COUNT(*) as students_count FROM students;

-- ========================================
-- SUCCESS MESSAGE
-- ========================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TABLES CREATED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Created tables: portal_users, schools, students';
    RAISE NOTICE 'Admin login: admin@rillcod.com / admin123';
    RAISE NOTICE 'RLS policies: Simple "allow all" for development';
    RAISE NOTICE '========================================';
END $$; 