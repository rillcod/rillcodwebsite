-- Decks and slides follow their lesson, instead of being left behind by it.
--
-- 20260929000044 shares a lesson's BODY: one master, mirrored to every class,
-- so correcting a typo corrects it everywhere. It could not do the same for
-- flashcard decks or slide decks, and said so:
--
--   a deck's content is its child flashcard_cards rows, and a slide deck's is
--   storage objects each class now owns its own copies of. Neither can be
--   pushed down by updating a column.
--
-- That left the worse half of the problem. A corrected lesson would reach all
-- 26 classes while the decks and slides taught FROM that lesson kept teaching
-- the old wording — and unlike a stale copy, nothing about the row would say
-- so. Sharing the lesson without this makes the mismatch harder to spot, not
-- easier.
--
-- Derived content cannot be corrected in place, so it is marked instead. A deck
-- whose lesson has changed is stale, the generators rebuild stale content
-- rather than skipping it as already present, and the rebuild is a copy from
-- the master for every class after the first — not an AI call each.
--
-- Marking is cheap and idempotent; the rebuild happens on the next sweep, so a
-- correction costs one flag now and one copy later rather than blocking the
-- editor.

alter table public.flashcard_decks
  add column if not exists content_stale_at timestamptz;

alter table public.lesson_materials
  add column if not exists content_stale_at timestamptz;

-- Partial: the generators ask "what is stale", never "what is fresh", and stale
-- rows are the small minority.
create index if not exists idx_flashcard_decks_stale
  on public.flashcard_decks (lesson_id)
  where content_stale_at is not null;

create index if not exists idx_lesson_materials_stale
  on public.lesson_materials (lesson_id)
  where content_stale_at is not null;

comment on column public.flashcard_decks.content_stale_at is
  'Set when the deck''s lesson changed under it. The generator rebuilds stale decks instead of skipping them as already present. Cleared on rebuild.';

/**
 * One trigger covers masters and mirrors alike, because a mirror IS a lesson.
 *
 * When a master is corrected, 20260929000044 pushes the new body to every
 * mirror — which is itself an update to a lessons row, so this fires again for
 * each of them and marks that class's own deck and slides. No second trigger
 * and no traversal of the mirror set is needed here.
 */
create or replace function public.mark_derived_content_stale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nothing derived exists for a lesson whose body did not actually move.
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
     -- A teacher who rewrote their own deck owns it now. Rebuilding would
     -- throw that away, which is worse than a deck that lags its lesson.
     and coalesce(d.metadata->>'is_customized', '') <> 'true';

  update public.lesson_materials m
     set content_stale_at = now()
   where m.lesson_id = new.id
     and m.file_type = 'slide-deck'
     and m.content_stale_at is null
     and coalesce(m.metadata->>'is_customized', '') <> 'true'
     -- Slides already published to learners are frozen by their own lock, for
     -- the same reason 20260929000044 will not rewrite a locked lesson.
     and m.content_locked_at is null;

  return new;
end;
$$;

drop trigger if exists lessons_mark_derived_stale on public.lessons;
create trigger lessons_mark_derived_stale
  after update of title, description, content, content_layout, lesson_notes
  on public.lessons
  for each row execute function public.mark_derived_content_stale();

comment on function public.mark_derived_content_stale() is
  'Flags a lesson''s deck and slides when its body changes, so the generators rebuild them instead of skipping them. Customised and locked rows are left alone.';
