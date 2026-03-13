-- Nuclear fix: drop every policy on portal_users and rebuild from scratch.
-- The original policies used EXISTS (SELECT 1 FROM portal_users ...) inside
-- policies ON portal_users — classic infinite recursion.
-- The fix uses a SECURITY DEFINER function that runs as postgres (superuser),
-- bypassing RLS entirely when checking the current user's role.

-- 1. Recreate the helper function with explicit row_security bypass
create or replace function public.get_my_role()
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  -- Runs as function owner (postgres = superuser = bypassrls)
  select role into v_role from portal_users where id = auth.uid();
  return v_role;
end;
$$;

grant execute on function public.get_my_role() to authenticated, anon;

-- 2. Drop EVERY existing policy on portal_users
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'portal_users'
  loop
    execute format('drop policy if exists %I on portal_users', pol.policyname);
  end loop;
end
$$;

-- 3. Rebuild clean non-recursive policies

-- Users can always read/update their own row
create policy "portal_users_self_select"
  on portal_users for select
  using (id = auth.uid());

create policy "portal_users_self_update"
  on portal_users for update
  using (id = auth.uid());

-- Staff (admin/teacher/school) can read all users
create policy "portal_users_staff_select"
  on portal_users for select
  using (get_my_role() in ('admin', 'teacher', 'school'));

-- Only admins can insert / delete / update any row
create policy "portal_users_admin_insert"
  on portal_users for insert
  with check (get_my_role() = 'admin');

create policy "portal_users_admin_update"
  on portal_users for update
  using (get_my_role() = 'admin');

create policy "portal_users_admin_delete"
  on portal_users for delete
  using (get_my_role() = 'admin');
