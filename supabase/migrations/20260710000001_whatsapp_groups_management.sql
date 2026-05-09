-- Extend whatsapp_groups with management metadata
alter table public.whatsapp_groups
  add column if not exists description      text,
  add column if not exists group_type       text not null default 'general',
  add column if not exists class_name       text,
  add column if not exists term             text,
  add column if not exists status           text not null default 'active',
  add column if not exists member_count     integer default 0,
  add column if not exists last_broadcast_at timestamptz,
  add column if not exists school_name      text;

-- Broadcast history — one row per announcement sent to a group
create table if not exists public.whatsapp_group_broadcasts (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references public.whatsapp_groups(id) on delete cascade,
  group_name  text,
  school_id   uuid references public.schools(id) on delete set null,
  school_name text,
  sent_by     uuid references public.portal_users(id) on delete set null,
  sent_by_name text,
  message     text not null,
  sent_at     timestamptz not null default now()
);

create index if not exists idx_wa_broadcasts_group on public.whatsapp_group_broadcasts(group_id, sent_at desc);
create index if not exists idx_wa_broadcasts_school on public.whatsapp_group_broadcasts(school_id, sent_at desc);
create index if not exists idx_wa_broadcasts_sender on public.whatsapp_group_broadcasts(sent_by, sent_at desc);

alter table public.whatsapp_group_broadcasts enable row level security;

create policy "staff can view broadcasts for their school"
  on public.whatsapp_group_broadcasts for select
  using (
    auth.uid() in (
      select id from public.portal_users
      where role = 'admin'
        or (role in ('teacher','school') and school_id = whatsapp_group_broadcasts.school_id)
    )
  );

create policy "staff can insert broadcasts"
  on public.whatsapp_group_broadcasts for insert
  with check (
    auth.uid() in (
      select id from public.portal_users where role in ('admin','teacher','school')
    )
  );

-- Allow update on groups (for PATCH — status, last_broadcast_at, etc.)
do $$ begin
  create policy "creator or admin can update"
    on public.whatsapp_groups for update
    using (
      auth.uid() = created_by
      or auth.uid() in (select id from public.portal_users where role = 'admin')
    );
exception when duplicate_object then null;
end $$;
