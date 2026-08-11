-- Keep the specialised parent-claim trail and the central staff audit trail in
-- agreement when the retained compatibility RPC is used.

create or replace function public.create_parent_and_link(
  p_email text,
  p_full_name text,
  p_phone text,
  p_student_id uuid,
  p_relationship text default 'Guardian'::text,
  p_auth_user_id uuid default null::uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.portal_users%rowtype;
  v_parent public.portal_users%rowtype;
  v_student public.students%rowtype;
  v_parent_id uuid;
  v_link_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_relationship text := coalesce(nullif(btrim(p_relationship), ''), 'Guardian');
  v_auth_email text;
begin
  select * into v_caller
    from public.portal_users
   where id = auth.uid()
     and role in ('admin', 'teacher', 'school')
     and coalesce(is_active, true) = true
     and coalesce(is_deleted, false) = false;
  if not found then
    raise exception 'Authorised staff access is required' using errcode = '42501';
  end if;

  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid parent email is required' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'A parent name is required' using errcode = '22023';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if v_student.user_id is null then
    raise exception 'The student portal account must be created before linking a parent'
      using errcode = '23514';
  end if;
  if v_caller.role <> 'admin' and (
    v_caller.school_id is null or v_student.school_id is distinct from v_caller.school_id
  ) then
    raise exception 'This student is outside your school scope' using errcode = '42501';
  end if;

  select * into v_parent
    from public.portal_users
   where lower(btrim(email)) = v_email
   limit 1
   for update;

  if found then
    if v_parent.role <> 'parent' or coalesce(v_parent.is_deleted, false) then
      raise exception 'This email belongs to a different account type' using errcode = '23505';
    end if;
    if p_auth_user_id is not null and p_auth_user_id <> v_parent.id then
      raise exception 'The supplied account does not match the existing parent' using errcode = '23505';
    end if;
    v_parent_id := v_parent.id;
    update public.portal_users
       set full_name = v_name,
           phone = nullif(btrim(coalesce(p_phone, '')), ''),
           updated_at = now()
     where id = v_parent_id;
  else
    if p_auth_user_id is null then
      raise exception 'Create the parent authentication account before linking'
        using errcode = '23514';
    end if;
    select lower(btrim(email)) into v_auth_email
      from auth.users
     where id = p_auth_user_id;
    if not found or v_auth_email is distinct from v_email then
      raise exception 'The parent authentication account does not match this email'
        using errcode = '23514';
    end if;
    insert into public.portal_users (
      id, email, full_name, role, phone, school_id, school_name,
      is_active, is_deleted, created_at, updated_at
    ) values (
      p_auth_user_id, v_email, v_name, 'parent', nullif(btrim(coalesce(p_phone, '')), ''),
      v_student.school_id, v_student.school_name, true, false, now(), now()
    ) returning id into v_parent_id;
  end if;

  insert into public.parent_student_links (parent_id, student_id, created_at, updated_at)
  values (v_parent_id, v_student.id, now(), now())
  on conflict (parent_id, student_id) do update set updated_at = excluded.updated_at
  returning id into v_link_id;

  update public.students
     set parent_email = v_email,
         parent_name = v_name,
         parent_phone = nullif(btrim(coalesce(p_phone, '')), ''),
         parent_relationship = v_relationship,
         updated_at = now()
   where id = v_student.id;

  insert into public.parent_claim_audit (
    student_id, parent_id, email, phone, action, note
  ) values (
    v_student.user_id, v_parent_id, v_email, nullif(btrim(coalesce(p_phone, '')), ''),
    'linked', 'Parent linked by authorised staff through the compatibility workflow.'
  );

  insert into public.audit_logs (
    user_id, actor_id, action, table_name, record_id,
    resource_type, resource_id, new_value, new_values, created_at
  ) values (
    v_caller.id, v_caller.id, 'parent_student_linked', 'parent_student_links', v_link_id,
    'parent_student_link', v_link_id::text, 'Parent account linked by authorised staff.',
    jsonb_build_object(
      'summary', 'Linked a parent account to the student.',
      'student_name', v_student.full_name,
      'parent_name', v_name,
      'school_name', v_student.school_name,
      'email', v_email,
      'relationship', v_relationship,
      'source', 'compatibility_workflow'
    ),
    now()
  );

  return json_build_object(
    'parent_id', v_parent_id,
    'student_id', v_student.id,
    'student_portal_user_id', v_student.user_id,
    'link_id', v_link_id,
    'email', v_email,
    'linked', true
  );
end;
$$;

revoke execute on function public.create_parent_and_link(text, text, text, uuid, text, uuid) from public, anon, service_role;
grant execute on function public.create_parent_and_link(text, text, text, uuid, text, uuid) to authenticated;

comment on function public.create_parent_and_link(text, text, text, uuid, text, uuid) is
  'Compatibility RPC for staff. Enforces school scope, auth-backed parent identity, canonical links, and matching specialised plus central audits.';
