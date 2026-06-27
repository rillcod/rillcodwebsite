-- HARD GUARD against duplicate flashcard decks.
--
-- Repeated "generate" clicks / double-submits on a lesson created twin decks (same
-- owner + title for the same lesson/course) because POST /api/flashcards/decks had no
-- existing-deck check and there was no DB constraint. The card-level dedup and the
-- auto-progression marker dedup already worked; only this manual/AI create path leaked.
--
-- The app now returns the existing deck instead of inserting a twin; this unique index
-- is the backstop that makes a duplicate impossible even under a race or a future code
-- path. COALESCE maps NULL lesson_id/course_id to a sentinel so NULLs compare equal
-- (a plain UNIQUE treats every NULL as distinct, which would let duplicates through).
--
-- Existing duplicates were merged/removed before this migration, so creation succeeds.

CREATE UNIQUE INDEX IF NOT EXISTS uq_flashcard_decks_owner_title_scope
  ON public.flashcard_decks (
    created_by,
    lower(btrim(title)),
    COALESCE(lesson_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
