-- Give decks and slides the metadata column everything already assumed.
--
-- Found by running the propagation chain against the live database rather than
-- reasoning about it. flashcard_decks and lesson_materials have no `metadata`
-- column and lesson_materials has no `content_locked_at` — unlike lessons and
-- assignments, which carry all three. Three things were written against columns
-- that do not exist:
--
--   1. 20260929000046's trigger reads d.metadata / m.metadata and
--      m.content_locked_at. It is LIVE and it throws, so every edit to a
--      lesson's title or body fails with "column d.metadata does not exist".
--      This is the urgent half.
--
--   2. buildCopy() writes `metadata` and `content_locked_at` onto every copy.
--      For these two tables that insert can never have succeeded — so copying a
--      deck or a slide deck has been failing since it was added. It failed
--      quietly, because reuseWeekContent treats a failed copy as "generate
--      instead", which is exactly the safe fallback it was built to have. Safe,
--      but it meant the saving was never actually being made.
--
--   3. isCustomised() in content-reuse.ts reads row.metadata, so for these
--      tables it always answered false. A deck a teacher had rewritten could be
--      handed to another class as though it were curriculum output.
--
-- Adding the column fixes all three at once and makes the four content tables
-- agree, which is the reason the assumption was reasonable in the first place.

alter table public.flashcard_decks
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.lesson_materials
  add column if not exists metadata jsonb default '{}'::jsonb;

comment on column public.flashcard_decks.metadata is
  'Matches lessons.metadata and assignments.metadata. Carries copied_from_content_id and is_customized, which the copy machinery in content-reuse.ts reads on all four content tables.';

-- Rebuilt without content_locked_at on lesson_materials: that column exists on
-- lessons, not here. Slides inherit their freeze from the lesson they belong
-- to, which 20260929000044 already refuses to rewrite while it is locked, so
-- the protection holds one level up rather than being duplicated here.
create or replace function public.mark_derived_content_stale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is not distinct from old.title
     and new.description is not distinct from old.description
     and new.content is not distinct from old.content
     and new.content_layout is not distinct from old.content_layout
     and new.lesson_notes is not distinct from old.lesson_notes then
    return new;
  end if;

  update public.flashcard_decks d
     set content_stale_at = now()
   where d.lesson_id = new.id
     and d.content_stale_at is null
     -- A teacher who rewrote their own deck owns it now. Rebuilding would throw
     -- that away, which is worse than a deck that lags its lesson.
     and coalesce(d.metadata->>'is_customized', '') <> 'true';

  update public.lesson_materials m
     set content_stale_at = now()
   where m.lesson_id = new.id
     and m.file_type = 'slide-deck'
     and m.content_stale_at is null
     and coalesce(m.metadata->>'is_customized', '') <> 'true';

  return new;
end;
$$;
