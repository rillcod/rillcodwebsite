-- A parent may submit the same school form for more than one linked child.
-- Preserve every existing parent-level signature as a legacy response while
-- making new responses child-specific and database-validated.

alter table public.consent_responses
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists student_id uuid;

update public.consent_responses
set id = gen_random_uuid()
where id is null;

alter table public.consent_responses
  alter column id set default gen_random_uuid(),
  alter column id set not null;

alter table public.consent_responses
  drop constraint if exists consent_responses_pkey;

alter table public.consent_responses
  add constraint consent_responses_pkey primary key (id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consent_responses_student_id_fkey'
      and conrelid = 'public.consent_responses'::regclass
  ) then
    alter table public.consent_responses
      add constraint consent_responses_student_id_fkey
      foreign key (student_id) references public.students(id) on delete cascade;
  end if;
end;
$$;

create unique index if not exists uq_consent_responses_child
  on public.consent_responses (form_id, parent_id, student_id)
  where student_id is not null;

create unique index if not exists uq_consent_responses_legacy_parent
  on public.consent_responses (form_id, parent_id)
  where student_id is null;

create index if not exists idx_consent_responses_student
  on public.consent_responses (student_id)
  where student_id is not null;

create or replace function public.guard_consent_response_child_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_school uuid;
  v_parent_school uuid;
  v_student_school uuid;
begin
  select parent_user.school_id into v_parent_school
  from public.portal_users parent_user
    where parent_user.id = new.parent_id
      and parent_user.role = 'parent'
      and coalesce(parent_user.is_deleted, false) = false;
  if not found then
    raise exception 'The consent signer must be an active parent account'
      using errcode = '23514';
  end if;

  select school_id into v_form_school
  from public.consent_forms
  where id = new.form_id;

  if new.student_id is null then
    if v_parent_school is distinct from v_form_school then
      raise exception 'This form belongs to a different school'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.parent_student_links link
    where link.parent_id = new.parent_id
      and link.student_id = new.student_id
  ) then
    raise exception 'The selected learner is not linked to this parent account'
      using errcode = '23514';
  end if;

  select school_id into v_student_school
  from public.students
  where id = new.student_id
    and coalesce(is_deleted, false) = false;

  if v_student_school is null then
    raise exception 'The selected learner is not active'
      using errcode = '23514';
  end if;

  if v_form_school is distinct from v_student_school then
    raise exception 'The selected learner does not belong to the school that issued this form'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_consent_response_child_link on public.consent_responses;
create trigger guard_consent_response_child_link
before insert or update of form_id, parent_id, student_id
on public.consent_responses
for each row execute function public.guard_consent_response_child_link();

drop policy if exists "parents insert own responses" on public.consent_responses;
create policy "parents insert linked child responses"
on public.consent_responses
for insert
to authenticated
with check (
  parent_id = auth.uid()
  and exists (
    select 1
    from public.portal_users parent_user
    join public.consent_forms form on form.id = consent_responses.form_id
    where parent_user.id = auth.uid()
      and parent_user.role = 'parent'
      and coalesce(parent_user.is_deleted, false) = false
      and (
        consent_responses.student_id is not null
        or parent_user.school_id = form.school_id
      )
  )
  and (
    student_id is null
    or exists (
      select 1 from public.parent_student_links link
      where link.parent_id = auth.uid()
        and link.student_id = consent_responses.student_id
    )
  )
);

revoke all on table public.consent_responses from anon;
revoke all on table public.consent_responses from authenticated;
grant select, insert on table public.consent_responses to authenticated;

comment on column public.consent_responses.student_id is
  'Canonical students.id for the child this parent signed for. Null identifies a preserved legacy parent-level signature.';
comment on function public.guard_consent_response_child_link() is
  'Prevents a consent response from claiming an unlinked learner or crossing school boundaries.';
