-- migration: flashcard tables
-- requirements: nf-4.1

-- flashcard_decks: a collection of cards scoped to an optional lesson/course
-- and a required school. teachers create decks for students to study.
create table if not exists public.flashcard_decks (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  lesson_id   uuid        references public.lessons(id),
  course_id   uuid        references public.courses(id),
  school_id   uuid        not null references public.schools(id),
  created_by  uuid        not null references public.portal_users(id),
  created_at  timestamptz not null default now()
);

-- flashcard_cards: individual front/back card pairs belonging to a deck.
-- cascades on delete so removing a deck clears its cards automatically.
create table if not exists public.flashcard_cards (
  id          uuid        primary key default gen_random_uuid(),
  deck_id     uuid        not null references public.flashcard_decks(id) on delete cascade,
  front       text        not null,
  back        text        not null,
  position    int         not null default 0,
  created_at  timestamptz not null default now()
);

-- flashcard_reviews: per-student sm-2 state for each card. the unique
-- constraint on (card_id, student_id) prevents duplicate review rows.
-- next_review_at and interval_days drive spaced-repetition scheduling.
create table if not exists public.flashcard_reviews (
  id              uuid         primary key default gen_random_uuid(),
  card_id         uuid         not null references public.flashcard_cards(id) on delete cascade,
  student_id      uuid         not null references public.portal_users(id) on delete cascade,
  next_review_at  timestamptz  not null default now(),
  interval_days   int          not null default 1,
  ease_factor     numeric(4,2) not null default 2.50,
  repetitions     int          not null default 0,
  unique (card_id, student_id)
);

create index if not exists idx_fr_student_review
  on public.flashcard_reviews(student_id, next_review_at);

-- ── row-level security ────────────────────────────────────────────────────────

alter table public.flashcard_decks   enable row level security;
alter table public.flashcard_cards   enable row level security;
alter table public.flashcard_reviews enable row level security;

-- flashcard_decks policies ----------------------------------------------------

-- students can select decks in their school (scoped by enrollment via school_id match)
drop policy if exists "students select decks in their school" on public.flashcard_decks;
create policy "students select decks in their school"
  on public.flashcard_decks
  for select
  using (
    school_id in (
      select school_id
      from public.portal_users
      where id = auth.uid()
        and role = 'student'
    )
  );

-- teachers and admins can select all decks in their school
drop policy if exists "teachers admins select decks in their school" on public.flashcard_decks;
create policy "teachers admins select decks in their school"
  on public.flashcard_decks
  for select
  using (
    school_id in (
      select school_id
      from public.portal_users
      where id = auth.uid()
        and role in ('teacher', 'admin', 'school')
    )
  );

-- teachers can insert decks for their own school
drop policy if exists "teachers insert own decks" on public.flashcard_decks;
create policy "teachers insert own decks"
  on public.flashcard_decks
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.portal_users
      where id = auth.uid()
        and role in ('teacher', 'admin', 'school')
    )
  );

-- teachers can update only their own decks
drop policy if exists "teachers update own decks" on public.flashcard_decks;
create policy "teachers update own decks"
  on public.flashcard_decks
  for update
  using (created_by = auth.uid());

-- teachers can delete only their own decks
drop policy if exists "teachers delete own decks" on public.flashcard_decks;
create policy "teachers delete own decks"
  on public.flashcard_decks
  for delete
  using (created_by = auth.uid());

-- flashcard_cards policies ----------------------------------------------------

-- students can select cards for decks in their school
drop policy if exists "students select cards in their school" on public.flashcard_cards;
create policy "students select cards in their school"
  on public.flashcard_cards
  for select
  using (
    exists (
      select 1
      from public.flashcard_decks fd
      join public.portal_users pu on pu.id = auth.uid()
      where fd.id        = flashcard_cards.deck_id
        and pu.school_id = fd.school_id
        and pu.role      = 'student'
    )
  );

-- teachers can select cards for decks in their school
drop policy if exists "teachers select cards in their school" on public.flashcard_cards;
create policy "teachers select cards in their school"
  on public.flashcard_cards
  for select
  using (
    exists (
      select 1
      from public.flashcard_decks fd
      join public.portal_users pu on pu.id = auth.uid()
      where fd.id        = flashcard_cards.deck_id
        and pu.school_id = fd.school_id
        and pu.role      in ('teacher', 'admin', 'school')
    )
  );

-- teachers can insert cards only for their own decks
drop policy if exists "teachers insert cards for own decks" on public.flashcard_cards;
create policy "teachers insert cards for own decks"
  on public.flashcard_cards
  for insert
  with check (
    exists (
      select 1
      from public.flashcard_decks fd
      where fd.id         = flashcard_cards.deck_id
        and fd.created_by = auth.uid()
    )
  );

-- teachers can update cards only for their own decks
drop policy if exists "teachers update cards for own decks" on public.flashcard_cards;
create policy "teachers update cards for own decks"
  on public.flashcard_cards
  for update
  using (
    exists (
      select 1
      from public.flashcard_decks fd
      where fd.id         = flashcard_cards.deck_id
        and fd.created_by = auth.uid()
    )
  );

-- teachers can delete cards only for their own decks
drop policy if exists "teachers delete cards for own decks" on public.flashcard_cards;
create policy "teachers delete cards for own decks"
  on public.flashcard_cards
  for delete
  using (
    exists (
      select 1
      from public.flashcard_decks fd
      where fd.id         = flashcard_cards.deck_id
        and fd.created_by = auth.uid()
    )
  );

-- flashcard_reviews policies --------------------------------------------------

-- students can select only their own review rows
drop policy if exists "students select own reviews" on public.flashcard_reviews;
create policy "students select own reviews"
  on public.flashcard_reviews
  for select
  using (student_id = auth.uid());

-- students can insert only their own review rows
drop policy if exists "students insert own reviews" on public.flashcard_reviews;
create policy "students insert own reviews"
  on public.flashcard_reviews
  for insert
  with check (student_id = auth.uid());

-- students can update only their own review rows
drop policy if exists "students update own reviews" on public.flashcard_reviews;
create policy "students update own reviews"
  on public.flashcard_reviews
  for update
  using (student_id = auth.uid());
