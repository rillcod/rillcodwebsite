-- Block duplicate active student names within a school while permitting audited,
-- per-student exceptions for genuine twins or distinct children with the same name.

alter table public.portal_users
  add column if not exists duplicate_name_exception_reason text,
  add column if not exists duplicate_name_exception_key text,
  add column if not exists duplicate_name_exception_approved_by uuid references public.portal_users(id) on delete set null,
  add column if not exists duplicate_name_exception_approved_at timestamptz;

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

  -- Serialize this school/name pair so simultaneous uploads cannot race.
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
    -- The exception is bound to this exact normalized name and must be approved
    -- by an active admin or a teacher assigned to the student's school.
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
before insert or update of full_name, school_id, role, is_deleted
on public.portal_users
for each row
execute function public.block_duplicate_active_student_name();
