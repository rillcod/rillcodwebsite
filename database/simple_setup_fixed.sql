-- Fixed Setup for 3 Tables: portal_users, schools, students
-- This handles existing policies and avoids duplicate errors

-- ========================================
-- STEP 1: DISABLE RLS TEMPORARILY
-- ========================================

ALTER TABLE portal_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE schools DISABLE ROW LEVEL SECURITY;
ALTER TABLE students DISABLE ROW LEVEL SECURITY;

-- ========================================
-- STEP 2: DROP ALL EXISTING POLICIES
-- ========================================

-- Drop policies for portal_users
DROP POLICY IF EXISTS "Allow first admin creation" ON portal_users;
DROP POLICY IF EXISTS "Admins can do anything" ON portal_users;
DROP POLICY IF EXISTS "Active teachers can read their own account" ON portal_users;
DROP POLICY IF EXISTS "Active teachers can update their own account" ON portal_users;
DROP POLICY IF EXISTS "Active students can read their own account" ON portal_users;
DROP POLICY IF EXISTS "Active students can update their own account" ON portal_users;
DROP POLICY IF EXISTS "Anyone can sign up as teacher (inactive)" ON portal_users;
DROP POLICY IF EXISTS "Admins can create any user" ON portal_users;
DROP POLICY IF EXISTS "Allow all operations for now" ON portal_users;

-- Drop policies for schools
DROP POLICY IF EXISTS "Allow all operations for now" ON schools;
DROP POLICY IF EXISTS "Admins can do anything" ON schools;
DROP POLICY IF EXISTS "Anyone can read schools" ON schools;

-- Drop policies for students
DROP POLICY IF EXISTS "Allow all operations for now" ON students;
DROP POLICY IF EXISTS "Admins can do anything" ON students;
DROP POLICY IF EXISTS "Anyone can read students" ON students;

-- ========================================
-- STEP 3: ENABLE RLS WITH SIMPLE POLICIES
-- ========================================

ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Create simple policies (only if they don't exist)
DO $$
BEGIN
  -- portal_users policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portal_users' AND policyname = 'portal_users_allow_all') THEN
    CREATE POLICY "portal_users_allow_all"
    ON portal_users
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;

  -- schools policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schools' AND policyname = 'schools_allow_all') THEN
    CREATE POLICY "schools_allow_all"
    ON schools
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;

  -- students policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'students' AND policyname = 'students_allow_all') THEN
    CREATE POLICY "students_allow_all"
    ON students
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- ========================================
-- STEP 4: CREATE ADMIN USER
-- ========================================

-- Create admin user if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM portal_users WHERE role = 'admin' AND is_active = true) THEN
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
    );
    RAISE NOTICE 'Admin user created: admin@rillcod.com / admin123';
  ELSE
    RAISE NOTICE 'Admin user already exists';
  END IF;
END $$;

-- ========================================
-- STEP 5: GRANT PERMISSIONS
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
-- STEP 6: VERIFY SETUP
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
  roles,
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
  RAISE NOTICE 'SETUP COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables configured: portal_users, schools, students';
  RAISE NOTICE 'Admin login: admin@rillcod.com / admin123';
  RAISE NOTICE 'RLS policies: Simple "allow all" for development';
  RAISE NOTICE '========================================';
END $$; 