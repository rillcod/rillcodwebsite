-- migration: enhance announcements table for NF-15
-- add status, expires_at, school_id, class_id columns

alter table public.announcements
  add column if not exists status     text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  add column if not exists expires_at timestamptz,
  add column if not exists school_id  uuid references public.schools(id),
  add column if not exists class_id   uuid references public.classes(id);

-- extend target_audience check to include 'parents' and 'class'
alter table public.announcements
  drop constraint if exists announcements_target_audience_check;

alter table public.announcements
  add constraint announcements_target_audience_check
    check (target_audience in ('all', 'students', 'teachers', 'admins', 'parents', 'class'));
