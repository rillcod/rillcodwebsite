-- migration: study groups moderation and code pad syncing
-- add code_content column to study_groups
alter table public.study_groups add column if not exists code_content text default '';

-- update study_groups insertion policy (teachers and admins only)
drop policy if exists "authenticated users insert groups" on public.study_groups;
create policy "teachers admins insert groups"
  on public.study_groups
  for insert
  with check (
    exists (
      select 1 
      from public.portal_users pu 
      where pu.id = auth.uid() 
      and pu.role in ('teacher', 'admin', 'school')
    )
  );

-- allow teachers and admins to update groups in their school (for moderation/archiving)
drop policy if exists "teacher admin update groups" on public.study_groups;
create policy "teacher admin update groups"
  on public.study_groups
  for update
  using (
    exists (
      select 1 
      from public.portal_users pu 
      where pu.id = auth.uid() 
      and pu.role in ('teacher', 'admin', 'school')
      and pu.school_id = study_groups.school_id
    )
  );

-- allow teachers and admins to delete groups in their school
drop policy if exists "teacher admin delete groups" on public.study_groups;
create policy "teacher admin delete groups"
  on public.study_groups
  for delete
  using (
    exists (
      select 1 
      from public.portal_users pu 
      where pu.id = auth.uid() 
      and pu.role in ('teacher', 'admin', 'school')
      and pu.school_id = study_groups.school_id
    )
  );

-- update study_group_messages policies to allow moderation (deletion)
drop policy if exists "teachers admins delete messages" on public.study_group_messages;
create policy "teachers admins delete messages"
  on public.study_group_messages
  for delete
  using (
    exists (
      select 1 
      from public.portal_users pu
      join public.study_groups sg on sg.id = study_group_messages.group_id
      where pu.id = auth.uid()
      and pu.role in ('teacher', 'admin', 'school')
      and pu.school_id = sg.school_id
    )
  );
