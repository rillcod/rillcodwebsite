-- Fix flashcard_decks RLS and school_id constraint.
--
-- Problem: school_id is NOT NULL, but admin accounts have school_id = NULL.
-- When an admin creates a flashcard deck the insert fails (NOT NULL violation
-- which Supabase surfaces as an RLS error).  The SELECT policies also silently
-- return zero rows for admins because NULL IN (...) is never true.
--
-- Fix: make school_id nullable (admins create global decks), rewrite all four
-- policies to treat admin separately from school-scoped teacher/school users.

-- 1. Relax the NOT NULL constraint
ALTER TABLE public.flashcard_decks ALTER COLUMN school_id DROP NOT NULL;

-- 2. Drop all existing policies
DROP POLICY IF EXISTS "students select decks in their school"         ON public.flashcard_decks;
DROP POLICY IF EXISTS "teachers admins select decks in their school"  ON public.flashcard_decks;
DROP POLICY IF EXISTS "teachers insert own decks"                     ON public.flashcard_decks;
DROP POLICY IF EXISTS "teachers update own decks"                     ON public.flashcard_decks;
DROP POLICY IF EXISTS "teachers delete own decks"                     ON public.flashcard_decks;

-- 3. SELECT
--    · admin sees all decks
--    · teacher/school sees decks for their school OR global (school_id IS NULL)
--    · student sees decks for their school OR global
CREATE POLICY "select flashcard decks"
  ON public.flashcard_decks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND (
          pu.role = 'admin'
          OR (
            pu.role IN ('teacher', 'school', 'student')
            AND (
              flashcard_decks.school_id IS NULL
              OR pu.school_id = flashcard_decks.school_id
            )
          )
        )
    )
  );

-- 4. INSERT
--    · admin can insert any deck (school_id may be null for global decks)
--    · teacher/school must set school_id to their own school
CREATE POLICY "insert flashcard decks"
  ON public.flashcard_decks
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid()
        AND pu.role IN ('admin', 'teacher', 'school')
        AND (
          pu.role = 'admin'
          OR flashcard_decks.school_id IS NULL
          OR pu.school_id = flashcard_decks.school_id
        )
    )
  );

-- 5. UPDATE — own decks only
CREATE POLICY "update flashcard decks"
  ON public.flashcard_decks
  FOR UPDATE
  USING (created_by = auth.uid());

-- 6. DELETE — own decks only
CREATE POLICY "delete flashcard decks"
  ON public.flashcard_decks
  FOR DELETE
  USING (created_by = auth.uid());

-- 7. Also fix flashcard_cards SELECT so students can see cards in global decks
DROP POLICY IF EXISTS "students select cards in their school"  ON public.flashcard_cards;
DROP POLICY IF EXISTS "teachers select cards in their school"  ON public.flashcard_cards;

CREATE POLICY "select flashcard cards"
  ON public.flashcard_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.flashcard_decks fd
      JOIN public.portal_users pu ON pu.id = auth.uid()
      WHERE fd.id = flashcard_cards.deck_id
        AND (
          pu.role = 'admin'
          OR (
            pu.role IN ('teacher', 'school', 'student')
            AND (fd.school_id IS NULL OR pu.school_id = fd.school_id)
          )
        )
    )
  );
