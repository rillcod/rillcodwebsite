-- App-wide key/value settings table (used for AI API key, etc.)
create table if not exists app_settings (
  key   text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- Only admins can read/write; mobile app reads via service role through supabase client
alter table app_settings enable row level security;

-- All authenticated users can read (needed so AI features work for students/teachers)
create policy "Authenticated read app_settings"
  on app_settings for select
  using (auth.uid() is not null);

-- Admins and teachers can insert/update/delete
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

-- Placeholder row so the AI screen doesn't show "not configured" after migration
-- Replace the empty string with your actual OpenRouter API key via the Settings screen
insert into app_settings (key, value)
values ('openrouter_api_key', '')
on conflict (key) do nothing;
