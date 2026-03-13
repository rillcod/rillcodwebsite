-- The is_admin() function is used in portal_users RLS policies but was
-- defined without SECURITY DEFINER, causing infinite recursion when
-- portal_users policies call is_admin() which queries portal_users again.
-- Fix: redefine is_admin() as SECURITY DEFINER (runs as postgres/superuser,
-- bypasses RLS) — same pattern as get_my_role().

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from portal_users where id = auth.uid();
  return v_role = 'admin';
end;
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- Also fix is_staff / is_teacher if they exist with the same pattern
create or replace function public.is_staff()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from portal_users where id = auth.uid();
  return v_role in ('admin', 'teacher', 'school');
end;
$$;

grant execute on function public.is_staff() to authenticated, anon;
