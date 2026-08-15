-- Somewhere for a school's photographs and clips to live.
--
-- The gallery endpoint was already written against `school_gallery_media`, and
-- the table did not exist. Both halves failed quietly and in opposite
-- directions: the read wrapped its query in a try/catch and returned an empty
-- gallery for ever, and the write uploaded the file to R2, swallowed the insert
-- error, and answered "Photo uploaded to school gallery!" — so a teacher who had
-- just recorded a capstone was told it worked while the record was discarded and
-- the file left orphaned in the bucket.
--
-- The uploads themselves are the reason this matters: the proposal needs
-- evidence, the school report wants a QR to a capstone clip, and a teacher with
-- a phone in a classroom is the only person who can produce either.

create table if not exists public.school_gallery_media (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  -- Which term the work belongs to, so a report can show that term's evidence.
  -- Nullable: a photograph is worth keeping even when nobody tagged it.
  academic_term_id  uuid references public.academic_terms(id) on delete set null,
  url               text not null,
  thumbnail_url     text,
  title             text not null default 'Classroom snapshot',
  category          text not null default 'classroom'
                      check (category in ('classroom', 'robotics', 'capstone', 'event', 'award')),
  media_type        text not null default 'image'
                      check (media_type in ('image', 'video')),
  -- A capstone demonstration is the clip a QR code on the report points at.
  is_capstone_demo  boolean not null default false,
  uploaded_by       uuid references public.portal_users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- The gallery is always read one school at a time, newest first.
create index if not exists idx_school_gallery_media_school
  on public.school_gallery_media (school_id, created_at desc);

-- The report asks for one term's capstone clips.
create index if not exists idx_school_gallery_media_capstone
  on public.school_gallery_media (school_id, academic_term_id)
  where is_capstone_demo;

alter table public.school_gallery_media enable row level security;

-- No policies: every read and write goes through the route, which checks the
-- caller against `teacher_schools` before it touches anything. Leaving the table
-- closed means a leaked anon key cannot enumerate other schools' media.

comment on table public.school_gallery_media is
  'Photographs and clips uploaded per school and term. Feeds the school gallery, the proposal evidence strip, and the capstone QR codes on the school report.';
