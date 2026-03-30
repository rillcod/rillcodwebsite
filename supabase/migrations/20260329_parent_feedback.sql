-- Parent feedback table
create table if not exists public.parent_feedback (
  id           uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references public.portal_users(id) on delete cascade,
  category     text not null default 'General Experience',
  rating       smallint check (rating between 1 and 5),
  message      text not null,
  is_anonymous boolean not null default false,
  status       text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indexes
create index if not exists parent_feedback_portal_user_id_idx on public.parent_feedback(portal_user_id);
create index if not exists parent_feedback_status_idx on public.parent_feedback(status);
create index if not exists parent_feedback_created_at_idx on public.parent_feedback(created_at desc);

-- RLS
alter table public.parent_feedback enable row level security;

-- Parents can insert their own feedback
create policy "Parents can insert own feedback"
  on public.parent_feedback for insert
  to authenticated
  with check (portal_user_id = auth.uid());

-- Parents can view their own feedback
create policy "Parents can view own feedback"
  on public.parent_feedback for select
  to authenticated
  using (portal_user_id = auth.uid());

-- Admin and teacher can view all feedback
create policy "Staff can view all feedback"
  on public.parent_feedback for select
  to authenticated
  using (
    exists (
      select 1 from public.portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  );

-- Admin and teacher can update status
create policy "Staff can update feedback status"
  on public.parent_feedback for update
  to authenticated
  using (
    exists (
      select 1 from public.portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from public.portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  );

-- Auto-update updated_at
create or replace function public.update_parent_feedback_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists parent_feedback_updated_at on public.parent_feedback;
create trigger parent_feedback_updated_at
  before update on public.parent_feedback
  for each row execute function public.update_parent_feedback_updated_at();
