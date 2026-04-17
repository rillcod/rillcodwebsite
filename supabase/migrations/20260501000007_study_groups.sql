-- migration: study groups tables
-- requirements: nf-3.1

-- study_groups: a course-scoped group created by any authenticated user within
-- a school. status can be 'active' or 'inactive' (set inactive when the course ends).
create table if not exists public.study_groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  course_id   uuid        references public.courses(id),
  school_id   uuid        not null references public.schools(id),
  created_by  uuid        not null references public.portal_users(id),
  status      text        not null default 'active'
                check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now()
);

-- study_group_members: composite primary key ensures a user can only appear
-- once per group. cascade deletes remove memberships when a group is deleted.
create table if not exists public.study_group_members (
  group_id   uuid        not null references public.study_groups(id) on delete cascade,
  user_id    uuid        not null references public.portal_users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- study_group_messages: messages posted inside a study group. indexed by
-- (group_id, created_at desc) so paginating the most recent messages is fast.
create table if not exists public.study_group_messages (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.study_groups(id) on delete cascade,
  sender_id  uuid        not null references public.portal_users(id),
  content    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sgm_group_created
  on public.study_group_messages(group_id, created_at desc);

-- ── row-level security ────────────────────────────────────────────────────────

alter table public.study_groups        enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_group_messages enable row level security;

-- study_groups policies -------------------------------------------------------

-- enrolled students can select groups that belong to their school
drop policy if exists "students select groups in their school" on public.study_groups;
create policy "students select groups in their school"
  on public.study_groups
  for select
  using (
    school_id in (
      select school_id
      from public.portal_users
      where id = auth.uid()
    )
    and exists (
      select 1
      from public.portal_users
      where id = auth.uid()
        and role = 'student'
    )
  );

-- any authenticated user can create a group
drop policy if exists "authenticated users insert groups" on public.study_groups;
create policy "authenticated users insert groups"
  on public.study_groups
  for insert
  with check (auth.uid() is not null);

-- only the creator can update their group
drop policy if exists "creator updates own group" on public.study_groups;
create policy "creator updates own group"
  on public.study_groups
  for update
  using (created_by = auth.uid());

-- only the creator can delete their group
drop policy if exists "creator deletes own group" on public.study_groups;
create policy "creator deletes own group"
  on public.study_groups
  for delete
  using (created_by = auth.uid());

-- study_group_members policies ------------------------------------------------

-- members can select their own membership rows
drop policy if exists "members select own rows" on public.study_group_members;
create policy "members select own rows"
  on public.study_group_members
  for select
  using (user_id = auth.uid());

-- any authenticated user can join a group (service layer enforces the 20-member cap)
drop policy if exists "authenticated users insert membership" on public.study_group_members;
create policy "authenticated users insert membership"
  on public.study_group_members
  for insert
  with check (auth.uid() is not null);

-- members can only remove themselves
drop policy if exists "members delete own row" on public.study_group_members;
create policy "members delete own row"
  on public.study_group_members
  for delete
  using (user_id = auth.uid());

-- study_group_messages policies -----------------------------------------------

-- members can select all messages in groups they belong to
drop policy if exists "members select messages in their groups" on public.study_group_messages;
create policy "members select messages in their groups"
  on public.study_group_messages
  for select
  using (
    exists (
      select 1
      from public.study_group_members sgm
      where sgm.group_id = study_group_messages.group_id
        and sgm.user_id  = auth.uid()
    )
  );

-- teachers and admins can read messages in groups within their school (read-only)
drop policy if exists "teachers admins select messages in school" on public.study_group_messages;
create policy "teachers admins select messages in school"
  on public.study_group_messages
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      join public.study_groups sg on sg.id = study_group_messages.group_id
      where pu.id        = auth.uid()
        and pu.role      in ('admin', 'teacher', 'school')
        and pu.school_id = sg.school_id
    )
  );

-- only group members can post messages
drop policy if exists "members insert messages" on public.study_group_messages;
create policy "members insert messages"
  on public.study_group_messages
  for insert
  with check (
    exists (
      select 1
      from public.study_group_members sgm
      where sgm.group_id = study_group_messages.group_id
        and sgm.user_id  = auth.uid()
    )
  );
