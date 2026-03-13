-- Fix infinite recursion on portal_users RLS policies.
-- Policies that do EXISTS (SELECT 1 FROM portal_users WHERE id = auth.uid() AND role = 'admin')
-- inside a policy ON portal_users cause infinite recursion because evaluating the policy
-- triggers the same policy again.
--
-- Fix: use a SECURITY DEFINER function which runs as the function owner (bypasses RLS),
-- so it reads portal_users directly without re-triggering the policy.

create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from portal_users where id = auth.uid();
$$;

-- Drop and recreate the recursive policy on portal_users
drop policy if exists "Admins can manage all users" on portal_users;
create policy "Admins can manage all users" on portal_users
  for all
  using (get_my_role() = 'admin');

-- Also add a policy so teachers/admins/school can read other users
-- (needed for things like listing students, viewing profiles)
drop policy if exists "Staff can view all users" on portal_users;
create policy "Staff can view all users" on portal_users
  for select
  using (
    get_my_role() in ('admin', 'teacher', 'school')
  );
