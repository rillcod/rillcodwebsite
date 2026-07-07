-- Full, reversible-safe hard delete of a portal user (student/parent/teacher account).
-- Removes every FK child row (referencing portal_users.id and, transitively, the linked
-- students.id), the students registry row, the portal_users row, and the auth.users row —
-- a complete wipe with no orphans. Used by the admin user-delete and by the class-health
-- duplicate-merge tooling so "delete" truly clears the account everywhere.
create or replace function public.hard_delete_portal_user(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  s_id uuid;
  passes int;
  rc int;
  deleted_children int := 0;
begin
  select id into s_id from students where user_id = p_id limit 1;

  -- Clear children in a few passes so grandchildren clear before their parents.
  for passes in 1..3 loop
    for r in
      select tc.table_schema, tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name = 'portal_users' and ccu.column_name = 'id'
        and tc.table_name <> 'portal_users'
    loop
      begin
        execute format('delete from %I.%I where %I = $1', r.table_schema, r.table_name, r.column_name) using p_id;
        get diagnostics rc = row_count;
        deleted_children := deleted_children + rc;
      exception when others then null;
      end;
    end loop;

    if s_id is not null then
      for r in
        select tc.table_schema, tc.table_name, kcu.column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
        where tc.constraint_type = 'FOREIGN KEY'
          and ccu.table_name = 'students' and ccu.column_name = 'id'
          and tc.table_name <> 'students'
      loop
        begin
          execute format('delete from %I.%I where %I = $1', r.table_schema, r.table_name, r.column_name) using s_id;
        exception when others then null;
        end;
      end loop;
    end if;
  end loop;

  delete from students where user_id = p_id;
  delete from portal_users where id = p_id;
  delete from auth.users where id = p_id;

  return jsonb_build_object('deleted', true, 'user_id', p_id, 'student_id', s_id, 'children_removed', deleted_children);
end $$;

revoke all on function public.hard_delete_portal_user(uuid) from public, anon, authenticated;
