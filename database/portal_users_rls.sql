-- Portal Users Table with RLS Policies
-- This script creates the portal_users table and sets up Row Level Security policies

-- Create portal_users table if it doesn't exist
create table if not exists portal_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text,
  role text check (role in ('admin', 'teacher', 'student')) not null,
  is_active boolean default false,
  student_id uuid references students(id),
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_portal_users_email on portal_users(email);
create index if not exists idx_portal_users_role on portal_users(role);
create index if not exists idx_portal_users_active on portal_users(is_active);

-- Enable Row Level Security
alter table portal_users enable row level security;

-- Drop existing policies if they exist (for clean setup)
drop policy if exists "Admins can do anything" on portal_users;
drop policy if exists "Active teachers can read/update their own account" on portal_users;
drop policy if exists "Active students can read/update their own account" on portal_users;
drop policy if exists "Anyone can sign up as teacher (inactive)" on portal_users;
drop policy if exists "Admins can create any user" on portal_users;

-- Policy 1: Admins have full access to all rows
create policy "Admins can do anything"
on portal_users
for all
using (
  auth.role() = 'authenticated'
  and exists (
    select 1 from portal_users as u
    where u.email = auth.email() and u.role = 'admin' and u.is_active = true
  )
);

-- Policy 2: Active teachers can read and update their own account
create policy "Active teachers can read/update their own account"
on portal_users
for select, update
using (
  auth.role() = 'authenticated'
  and email = auth.email()
  and role = 'teacher'
  and is_active = true
);

-- Policy 3: Active students can read and update their own account
create policy "Active students can read/update their own account"
on portal_users
for select, update
using (
  auth.role() = 'authenticated'
  and email = auth.email()
  and role = 'student'
  and is_active = true
);

-- Policy 4: Anyone can sign up as teacher (but they start as inactive)
create policy "Anyone can sign up as teacher (inactive)"
on portal_users
for insert
with check (
  role = 'teacher'
  and is_active = false
);

-- Policy 5: Admins can create any type of user (admin, teacher, student)
create policy "Admins can create any user"
on portal_users
for insert
with check (
  auth.role() = 'authenticated'
  and exists (
    select 1 from portal_users as u
    where u.email = auth.email() and u.role = 'admin' and u.is_active = true
  )
);

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on portal_users to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Insert a default admin user (optional - you can create via the form instead)
-- Uncomment and modify the line below if you want to create a default admin
-- insert into portal_users (email, password_hash, full_name, role, is_active) 
-- values ('admin@rillcod.com', 'YWRtaW4xMjM=', 'System Administrator', 'admin', true);

-- Display table structure
select 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
from information_schema.columns 
where table_name = 'portal_users' 
order by ordinal_position;

-- Display created policies
select 
  policyname as policy_name,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies 
where tablename = 'portal_users'; 