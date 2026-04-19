-- Enhanced flashcard system with images, tags, and analytics
-- Migration: 20260501000021_flashcards_enhanced

-- Add image support and metadata to flashcard_cards
ALTER TABLE public.flashcard_cards
ADD COLUMN IF NOT EXISTS front_image_url text,
ADD COLUMN IF NOT EXISTS back_image_url text,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS difficulty_level text DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add template field if not exists
ALTER TABLE public.flashcard_cards
ADD COLUMN IF NOT EXISTS template text DEFAULT 'classic';

-- Add study mode preferences to flashcard_decks
ALTER TABLE public.flashcard_decks
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Enhanced flashcard_reviews with more tracking
ALTER TABLE public.flashcard_reviews
ADD COLUMN IF NOT EXISTS study_time_seconds int DEFAULT 0,
ADD COLUMN IF NOT EXISTS confidence_level int DEFAULT 3 CHECK (confidence_level BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create flashcard_study_sessions table for analytics
CREATE TABLE IF NOT EXISTS public.flashcard_study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.portal_users(id) ON DELETE CASCADE,
  cards_studied int NOT NULL DEFAULT 0,
  cards_correct int NOT NULL DEFAULT 0,
  cards_incorrect int NOT NULL DEFAULT 0,
  max_streak int NOT NULL DEFAULT 0,
  study_duration_seconds int NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_student 
  ON public.flashcard_study_sessions(student_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_study_sessions_deck 
  ON public.flashcard_study_sessions(deck_id, completed_at DESC);

-- Create flashcard_card_statistics for teacher analytics
CREATE TABLE IF NOT EXISTS public.flashcard_card_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.flashcard_cards(id) ON DELETE CASCADE,
  total_reviews int NOT NULL DEFAULT 0,
  correct_reviews int NOT NULL DEFAULT 0,
  incorrect_reviews int NOT NULL DEFAULT 0,
  average_confidence numeric(3,2) DEFAULT 3.00,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id)
);

-- Function to update card statistics
CREATE OR REPLACE FUNCTION update_flashcard_statistics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.flashcard_card_statistics (card_id, total_reviews, correct_reviews, incorrect_reviews)
  VALUES (NEW.card_id, 1, CASE WHEN NEW.repetitions > OLD.repetitions THEN 1 ELSE 0 END, CASE WHEN NEW.repetitions <= OLD.repetitions THEN 1 ELSE 0 END)
  ON CONFLICT (card_id) DO UPDATE SET
    total_reviews = flashcard_card_statistics.total_reviews + 1,
    correct_reviews = flashcard_card_statistics.correct_reviews + CASE WHEN NEW.repetitions > OLD.repetitions THEN 1 ELSE 0 END,
    incorrect_reviews = flashcard_card_statistics.incorrect_reviews + CASE WHEN NEW.repetitions <= OLD.repetitions THEN 1 ELSE 0 END,
    last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update statistics on review
DROP TRIGGER IF EXISTS trigger_update_flashcard_statistics ON public.flashcard_reviews;
CREATE TRIGGER trigger_update_flashcard_statistics
  AFTER UPDATE ON public.flashcard_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_flashcard_statistics();

-- RLS Policies for new tables

ALTER TABLE public.flashcard_study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_card_statistics ENABLE ROW LEVEL SECURITY;

-- Students can view their own study sessions
DROP POLICY IF EXISTS "students view own sessions" ON public.flashcard_study_sessions;
CREATE POLICY "students view own sessions"
  ON public.flashcard_study_sessions
  FOR SELECT
  USING (student_id = auth.uid());

-- Students can insert their own study sessions
DROP POLICY IF EXISTS "students insert own sessions" ON public.flashcard_study_sessions;
CREATE POLICY "students insert own sessions"
  ON public.flashcard_study_sessions
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Teachers can view sessions for their school's decks
DROP POLICY IF EXISTS "teachers view school sessions" ON public.flashcard_study_sessions;
CREATE POLICY "teachers view school sessions"
  ON public.flashcard_study_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_decks fd
      JOIN public.portal_users pu ON pu.id = auth.uid()
      WHERE fd.id = flashcard_study_sessions.deck_id
        AND fd.school_id = pu.school_id
        AND pu.role IN ('teacher', 'admin', 'school')
    )
  );

-- Teachers can view card statistics for their decks
DROP POLICY IF EXISTS "teachers view card stats" ON public.flashcard_card_statistics;
CREATE POLICY "teachers view card stats"
  ON public.flashcard_card_statistics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_cards fc
      JOIN public.flashcard_decks fd ON fd.id = fc.deck_id
      JOIN public.portal_users pu ON pu.id = auth.uid()
      WHERE fc.id = flashcard_card_statistics.card_id
        AND fd.school_id = pu.school_id
        AND pu.role IN ('teacher', 'admin', 'school')
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cards_tags ON public.flashcard_cards USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_cards_difficulty ON public.flashcard_cards(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_cards_starred ON public.flashcard_cards(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_decks_tags ON public.flashcard_decks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_reviews_next_review ON public.flashcard_reviews(student_id, next_review_at);

-- Function to get due cards for a student
CREATE OR REPLACE FUNCTION get_due_flashcards(p_student_id uuid, p_deck_id uuid DEFAULT NULL)
RETURNS TABLE (
  card_id uuid,
  deck_id uuid,
  front text,
  back text,
  front_image_url text,
  back_image_url text,
  template text,
  difficulty_level text,
  next_review_at timestamptz,
  ease_factor numeric,
  repetitions int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fc.id,
    fc.deck_id,
    fc.front,
    fc.back,
    fc.front_image_url,
    fc.back_image_url,
    fc.template,
    fc.difficulty_level,
    COALESCE(fr.next_review_at, now()) as next_review_at,
    COALESCE(fr.ease_factor, 2.50) as ease_factor,
    COALESCE(fr.repetitions, 0) as repetitions
  FROM public.flashcard_cards fc
  LEFT JOIN public.flashcard_reviews fr ON fr.card_id = fc.id AND fr.student_id = p_student_id
  WHERE (p_deck_id IS NULL OR fc.deck_id = p_deck_id)
    AND (fr.next_review_at IS NULL OR fr.next_review_at <= now())
  ORDER BY COALESCE(fr.next_review_at, now()) ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_due_flashcards(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.flashcard_study_sessions IS 'Tracks completed study sessions for analytics';
COMMENT ON TABLE public.flashcard_card_statistics IS 'Aggregated statistics per card for teacher insights';
COMMENT ON FUNCTION get_due_flashcards IS 'Returns cards due for review using spaced repetition algorithm';
