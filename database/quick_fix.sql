-- Quick Fix for Duplicate Policy Error
-- Run this first to fix the immediate error

-- Drop the duplicate policies
DROP POLICY IF EXISTS "Allow all operations for now" ON portal_users;
DROP POLICY IF EXISTS "Allow all operations for now" ON schools;
DROP POLICY IF EXISTS "Allow all operations for now" ON students;

-- Create new policies with unique names
CREATE POLICY "portal_users_allow_all"
ON portal_users
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "schools_allow_all"
ON schools
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "students_allow_all"
ON students
FOR ALL
USING (true)
WITH CHECK (true);

-- Verify the fix
SELECT 
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('portal_users', 'schools', 'students')
ORDER BY tablename, policyname;

RAISE NOTICE 'Duplicate policies fixed!'; 