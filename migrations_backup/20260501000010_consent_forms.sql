-- migration: consent forms tables
-- requirements: nf-8.1

-- consent_forms: a form created by a school admin or teacher, scoped to a school.
-- parents are expected to review and sign the form before the optional due_date.
create table if not exists public.consent_forms (
  id          uuid        primary key default gen_random_uuid(),
  school_id   uuid        not null references public.schools(id),
  title       text        not null,
  body        text        not null,
  due_date    timestamptz,
  created_by  uuid        not null references public.portal_users(id),
  created_at  timestamptz not null default now()
);

-- consent_responses: tracks which parents have signed which forms.
-- the composite primary key (form_id, parent_id) prevents a parent from
-- signing the same form more than once.
create table if not exists public.consent_responses (
  form_id    uuid        not null references public.consent_forms(id) on delete cascade,
  parent_id  uuid        not null references public.portal_users(id) on delete cascade,
  signed_at  timestamptz not null default now(),
  primary key (form_id, parent_id)
);

-- ── row-level security ────────────────────────────────────────────────────────

alter table public.consent_forms     enable row level security;
alter table public.consent_responses enable row level security;

-- consent_forms policies ------------------------------------------------------

-- school admins and teachers can select forms belonging to their school
drop policy if exists "admins teachers select forms in their school" on public.consent_forms;
create policy "admins teachers select forms in their school"
  on public.consent_forms
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'teacher', 'school')
        and pu.school_id = consent_forms.school_id
    )
  );

-- school admins and teachers can create forms for their school
drop policy if exists "admins teachers insert forms in their school" on public.consent_forms;
create policy "admins teachers insert forms in their school"
  on public.consent_forms
  for insert
  with check (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'teacher', 'school')
        and pu.school_id = consent_forms.school_id
    )
  );

-- school admins and teachers can update forms in their school
drop policy if exists "admins teachers update forms in their school" on public.consent_forms;
create policy "admins teachers update forms in their school"
  on public.consent_forms
  for update
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'teacher', 'school')
        and pu.school_id = consent_forms.school_id
    )
  );

-- parents can select forms belonging to their school (read-only)
drop policy if exists "parents select forms in their school" on public.consent_forms;
create policy "parents select forms in their school"
  on public.consent_forms
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id        = auth.uid()
        and pu.role      = 'parent'
        and pu.school_id = consent_forms.school_id
    )
  );

-- no delete policies on consent_forms (intentionally omitted)

-- consent_responses policies --------------------------------------------------

-- parents can select only their own response rows
drop policy if exists "parents select own responses" on public.consent_responses;
create policy "parents select own responses"
  on public.consent_responses
  for select
  using (parent_id = auth.uid());

-- parents can insert only their own response rows (service layer enforces 409 on conflict)
drop policy if exists "parents insert own responses" on public.consent_responses;
create policy "parents insert own responses"
  on public.consent_responses
  for insert
  with check (parent_id = auth.uid());

-- teachers and admins can select all responses for forms in their school
drop policy if exists "admins teachers select responses in their school" on public.consent_responses;
create policy "admins teachers select responses in their school"
  on public.consent_responses
  for select
  using (
    exists (
      select 1
      from public.portal_users  pu
      join public.consent_forms  cf on cf.id = consent_responses.form_id
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'teacher', 'school')
        and pu.school_id = cf.school_id
    )
  );
