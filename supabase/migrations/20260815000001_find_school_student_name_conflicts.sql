-- Reliable same-school name-key lookup for bulk register (bypasses PostgREST row caps).
-- Uses the same student_duplicate_name_key() as trg_block_duplicate_active_student_name.

alter table public.portal_users
  add column if not exists duplicate_name_exception_reason text,
  add column if not exists duplicate_name_exception_key text,
  add column if not exists duplicate_name_exception_approved_by uuid references public.portal_users(id) on delete set null,
  add column if not exists duplicate_name_exception_approved_at timestamptz;

create or replace function public.find_school_student_name_conflicts(
  p_school_id uuid,
  p_school_name text,
  p_name_keys text[]
)
returns table (
  id uuid,
  full_name text,
  email text,
  name_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (public.student_duplicate_name_key(pu.full_name))
    pu.id,
    pu.full_name,
    pu.email,
    public.student_duplicate_name_key(pu.full_name) as name_key
  from public.portal_users pu
  where pu.role = 'student'
    and coalesce(pu.is_deleted, false) = false
    and p_name_keys is not null
    and cardinality(p_name_keys) > 0
    and public.student_duplicate_name_key(pu.full_name) = any (p_name_keys)
    and (
      (p_school_id is not null and pu.school_id = p_school_id)
      or (
        p_school_name is not null
        and length(btrim(p_school_name)) > 0
        and pu.school_name ilike btrim(p_school_name)
      )
    )
  order by public.student_duplicate_name_key(pu.full_name), pu.created_at nulls last, pu.id;
$$;

revoke all on function public.find_school_student_name_conflicts(uuid, text, text[]) from public;
grant execute on function public.find_school_student_name_conflicts(uuid, text, text[]) to service_role;
grant execute on function public.find_school_student_name_conflicts(uuid, text, text[]) to authenticated;

-- Ensure the barricade trigger exists (safe re-apply if an older env missed 20260710000003).
create or replace function public.student_duplicate_name_key(raw_name text)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(string_agg(token, ' ' order by token), '')
  from regexp_split_to_table(
    trim(regexp_replace(lower(coalesce(raw_name, '')), '[^a-z0-9]+', ' ', 'g')),
    '\s+'
  ) as token
  where token <> '' and token !~ '^\d+$';
$$;

create or replace function public.block_duplicate_active_student_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  incoming_key text;
  valid_exception boolean := false;
begin
  if new.role <> 'student'
     or new.school_id is null
     or coalesce(new.is_deleted, false) then
    return new;
  end if;

  incoming_key := public.student_duplicate_name_key(new.full_name);
  if incoming_key = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.school_id::text || ':' || incoming_key, 0));

  if exists (
    select 1
    from public.portal_users existing
    where existing.id <> new.id
      and existing.role = 'student'
      and existing.school_id = new.school_id
      and coalesce(existing.is_deleted, false) = false
      and public.student_duplicate_name_key(existing.full_name) = incoming_key
  ) then
    select exists (
      select 1
      from public.portal_users approver
      where approver.id = new.duplicate_name_exception_approved_by
        and approver.role in ('admin', 'teacher')
        and coalesce(approver.is_deleted, false) = false
        and length(btrim(coalesce(new.duplicate_name_exception_reason, ''))) >= 10
        and new.duplicate_name_exception_key = incoming_key
        and new.duplicate_name_exception_approved_at is not null
        and (
          approver.role = 'admin'
          or approver.school_id = new.school_id
          or exists (
            select 1
            from public.teacher_schools ts
            where ts.teacher_id = approver.id
              and ts.school_id = new.school_id
          )
        )
    ) into valid_exception;

    if not valid_exception then
      raise exception using
        errcode = '23505',
        message = format('An active student named "%s" is already registered at this school.', new.full_name),
        constraint = 'portal_users_active_student_school_name_key';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_duplicate_active_student_name on public.portal_users;
create trigger trg_block_duplicate_active_student_name
before insert or update of full_name, school_id, role, is_deleted,
  duplicate_name_exception_reason, duplicate_name_exception_key,
  duplicate_name_exception_approved_by, duplicate_name_exception_approved_at
on public.portal_users
for each row
execute function public.block_duplicate_active_student_name();
