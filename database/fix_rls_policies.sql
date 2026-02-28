-- Fix RLS Policies for portal_users table
-- This script implements a simpler, non-recursive policy structure

-- Temporarily disable RLS completely to fix the infinite recursion issue
ALTER TABLE portal_users DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Admins can do anything" ON portal_users;
DROP POLICY IF EXISTS "Active teachers can read their own account" ON portal_users;
DROP POLICY IF EXISTS "Active teachers can update their own account" ON portal_users;
DROP POLICY IF EXISTS "Active students can read their own account" ON portal_users;
DROP POLICY IF EXISTS "Active students can update their own account" ON portal_users;
DROP POLICY IF EXISTS "Anyone can sign up as teacher (inactive)" ON portal_users;
DROP POLICY IF EXISTS "Admins can create any user" ON portal_users;
DROP POLICY IF EXISTS "Users can view their own profile" ON portal_users;
DROP POLICY IF EXISTS "Users can update their own profile" ON portal_users;
DROP POLICY IF EXISTS "Admins can view all users" ON portal_users;
DROP POLICY IF EXISTS "Admins can insert users" ON portal_users;
DROP POLICY IF EXISTS "Admins can update users" ON portal_users;
DROP POLICY IF EXISTS "Admins can delete users" ON portal_users;
DROP POLICY IF EXISTS "Allow first admin creation" ON portal_users;
DROP POLICY IF EXISTS "Allow all operations temporarily" ON portal_users;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON portal_users TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Note: After the system is working and you have created your admin user,
-- you can run the following SQL to re-enable RLS with basic policies:
/*
-- Re-enable RLS
ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;

-- Create basic policies
CREATE POLICY "Enable read access for all users"
ON portal_users FOR SELECT
USING (true);

CREATE POLICY "Enable insert for authenticated users"
ON portal_users FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for users based on email"
ON portal_users FOR UPDATE
USING (auth.email() = email);

CREATE POLICY "Enable delete for users based on email"
ON portal_users FOR DELETE
USING (auth.email() = email);
*/

-- Display the updated policies
select 
  policyname as policy_name,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies 
where tablename = 'portal_users'
order by policyname; 