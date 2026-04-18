-- migration: parent-teacher chat tables
-- requirements: nf-6.1

-- parent_teacher_threads: one conversation thread per (parent, teacher, student) triple.
-- the unique constraint prevents duplicate threads for the same participants.
create table if not exists public.parent_teacher_threads (
  id          uuid        primary key default gen_random_uuid(),
  parent_id   uuid        not null references public.portal_users(id),
  teacher_id  uuid        not null references public.portal_users(id),
  student_id  uuid        not null references public.portal_users(id),
  created_at  timestamptz not null default now(),
  unique (parent_id, teacher_id, student_id)
);

-- parent_teacher_messages: individual messages belonging to a thread.
-- cascades on delete so removing a thread clears its messages automatically.
-- is_read allows either participant to mark messages as read.
create table if not exists public.parent_teacher_messages (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references public.parent_teacher_threads(id) on delete cascade,
  sender_id   uuid        not null references public.portal_users(id),
  body        text        not null,
  sent_at     timestamptz not null default now(),
  is_read     boolean     not null default false
);

-- index to efficiently fetch messages for a thread in reverse-chronological order
create index if not exists idx_ptm_thread_sent
  on public.parent_teacher_messages(thread_id, sent_at desc);

-- ── row-level security ────────────────────────────────────────────────────────

alter table public.parent_teacher_threads  enable row level security;
alter table public.parent_teacher_messages enable row level security;

-- parent_teacher_threads policies ----------------------------------------------------

-- participants (parent or teacher) can select their own threads
drop policy if exists "participants select own threads" on public.parent_teacher_threads;
create policy "participants select own threads"
  on public.parent_teacher_threads
  for select
  using (
    parent_id  = auth.uid()
    or teacher_id = auth.uid()
  );

-- participants (parent or teacher) can insert new threads
drop policy if exists "participants insert threads" on public.parent_teacher_threads;
create policy "participants insert threads"
  on public.parent_teacher_threads
  for insert
  with check (
    parent_id  = auth.uid()
    or teacher_id = auth.uid()
  );

-- no delete or update policies on threads (immutable once created)

-- parent_teacher_messages policies ---------------------------------------------------

-- participants can select messages belonging to threads they are part of
drop policy if exists "participants select messages" on public.parent_teacher_messages;
create policy "participants select messages"
  on public.parent_teacher_messages
  for select
  using (
    exists (
      select 1
      from public.parent_teacher_threads t
      where t.id = parent_teacher_messages.thread_id
        and (t.parent_id = auth.uid() or t.teacher_id = auth.uid())
    )
  );

-- only participants can insert messages, and sender_id must be the caller
drop policy if exists "participants insert messages" on public.parent_teacher_messages;
create policy "participants insert messages"
  on public.parent_teacher_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.parent_teacher_threads t
      where t.id = parent_teacher_messages.thread_id
        and (t.parent_id = auth.uid() or t.teacher_id = auth.uid())
    )
  );

-- thread participants can update is_read on any message in their threads
drop policy if exists "participants update is_read" on public.parent_teacher_messages;
create policy "participants update is_read"
  on public.parent_teacher_messages
  for update
  using (
    exists (
      select 1
      from public.parent_teacher_threads t
      where t.id = parent_teacher_messages.thread_id
        and (t.parent_id = auth.uid() or t.teacher_id = auth.uid())
    )
  );
