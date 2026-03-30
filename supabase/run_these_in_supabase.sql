-- ============================================================
-- STEP 1: Parent Feedback Table
-- ============================================================
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

create index if not exists parent_feedback_portal_user_id_idx on public.parent_feedback(portal_user_id);
create index if not exists parent_feedback_status_idx on public.parent_feedback(status);
create index if not exists parent_feedback_created_at_idx on public.parent_feedback(created_at desc);

alter table public.parent_feedback enable row level security;

create policy "Parents can insert own feedback"
  on public.parent_feedback for insert
  to authenticated
  with check (portal_user_id = auth.uid());

create policy "Parents can view own feedback"
  on public.parent_feedback for select
  to authenticated
  using (portal_user_id = auth.uid());

create policy "Staff can view all feedback"
  on public.parent_feedback for select
  to authenticated
  using (
    exists (
      select 1 from public.portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  );

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


-- ============================================================
-- STEP 2: App Settings Table (for AI API key etc.)
-- ============================================================
create table if not exists app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

create policy "Authenticated read app_settings"
  on app_settings for select
  using (auth.uid() is not null);

create policy "Staff write app_settings"
  on app_settings for all
  using (
    exists (
      select 1 from portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  )
  with check (
    exists (
      select 1 from portal_users
      where id = auth.uid() and role in ('admin', 'teacher')
    )
  );

insert into app_settings (key, value)
values ('openrouter_api_key', '')
on conflict (key) do nothing;


-- ============================================================
-- STEP 3: Insert OpenRouter API Key
-- ============================================================
insert into app_settings (key, value)
values ('openrouter_api_key', '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')
on conflict (key) do update set value = excluded.value;
