-- Session-stamp flashcard decks (year + term) so study content stays isolated.

ALTER TABLE public.flashcard_decks
  ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_term_id ON public.flashcard_decks (term_id);

-- Backfill from live calendar session (decks had no prior term stamp).
UPDATE public.flashcard_decks
SET term_id = public.live_academic_term_id()
WHERE term_id IS NULL
  AND public.live_academic_term_id() IS NOT NULL;

-- Collapse accidental twins within the same owner/title/lesson/course/term before
-- rebuilding the unique index (keeps the oldest deck).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        created_by,
        lower(btrim(title)),
        COALESCE(lesson_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.flashcard_decks
)
DELETE FROM public.flashcard_decks d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1;

-- Rebuild unique guard so the same title can exist in different academic sessions.
DROP INDEX IF EXISTS public.uq_flashcard_decks_owner_title_scope;
CREATE UNIQUE INDEX IF NOT EXISTS uq_flashcard_decks_owner_title_scope
  ON public.flashcard_decks (
    created_by,
    lower(btrim(title)),
    COALESCE(lesson_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

COMMENT ON COLUMN public.flashcard_decks.term_id IS
  'Academic session (year + term) for flashcard deck isolation.';
