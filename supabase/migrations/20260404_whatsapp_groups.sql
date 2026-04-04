-- WhatsApp group links shared across staff at the same school
create table if not exists public.whatsapp_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  link        text not null,
  school_id   uuid references public.schools(id) on delete cascade,
  created_by  uuid references public.portal_users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Staff can read groups belonging to their school
alter table public.whatsapp_groups enable row level security;

create policy "staff can view their school groups"
  on public.whatsapp_groups for select
  using (
    auth.uid() in (
      select id from public.portal_users
      where role in ('admin','teacher','school')
      and (role = 'admin' or school_id = whatsapp_groups.school_id)
    )
  );

create policy "staff can insert groups"
  on public.whatsapp_groups for insert
  with check (
    auth.uid() in (
      select id from public.portal_users where role in ('admin','teacher','school')
    )
  );

create policy "creator or admin can delete"
  on public.whatsapp_groups for delete
  using (
    auth.uid() = created_by
    or auth.uid() in (select id from public.portal_users where role = 'admin')
  );
